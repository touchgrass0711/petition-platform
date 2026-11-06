import "server-only";
import nodemailer from "nodemailer";
import { serverEnv } from "@/lib/server/integrations";
import { defaultStore, type Store } from "@/lib/server/kv";

export type Mail = { to: string; subject: string; text: string; html: string };

type Env = Record<string, string | undefined>;
type Provider = {
  name: string;
  /** Free-plan daily cap; we stop at 95% so a provider's own counting lag never bounces a code. */
  dailyCap: number;
  configured(env: Env): boolean;
  /** HTTP providers: the request to send. */
  request?(mail: Mail, env: Env): { url: string; init: RequestInit };
  /** Non-HTTP providers: sends and answers with the HTTP status that means the same (200, 422, 429, 5xx). */
  send?(mail: Mail, env: Env): Promise<number>;
};

const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const fromName = (env: Env) => env.EMAIL_FROM_NAME ?? "Petition";

// Brevo first (largest free cap, 300/day), then Resend (100/day), then Mailjet (200/day, brands free mail), then Gmail.
export const PROVIDERS: Provider[] = [
  {
    name: "brevo",
    dailyCap: 300,
    configured: (env) => Boolean(env.BREVO_API_KEY),
    request: (m, env) => ({
      url: "https://api.brevo.com/v3/smtp/email",
      init: json({ "api-key": env.BREVO_API_KEY! }, {
        sender: { email: env.EMAIL_FROM, name: fromName(env) },
        to: [{ email: m.to }],
        subject: m.subject,
        textContent: m.text,
        htmlContent: m.html,
      }),
    }),
  },
  {
    name: "resend",
    dailyCap: 100,
    configured: (env) => Boolean(env.RESEND_API_KEY),
    request: (m, env) => ({
      url: "https://api.resend.com/emails",
      init: json({ Authorization: `Bearer ${env.RESEND_API_KEY}` }, {
        from: `${fromName(env)} <${env.EMAIL_FROM}>`,
        to: [m.to],
        subject: m.subject,
        text: m.text,
        html: m.html,
      }),
    }),
  },
  {
    name: "mailjet",
    dailyCap: 200,
    configured: (env) => Boolean(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY),
    request: (m, env) => ({
      url: "https://api.mailjet.com/v3.1/send",
      init: json({ Authorization: `Basic ${btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`)}` }, {
        Messages: [{ From: { Email: env.EMAIL_FROM, Name: fromName(env) }, To: [{ Email: m.to }], Subject: m.subject, TextPart: m.text, HTMLPart: m.html }],
      }),
    }),
  },
  {
    // Last resort for a deploy with no domain of its own (e.g. *.vercel.app): sent by the customer's own Gmail,
    // so it passes DMARC for gmail.com. Needs 2-Step Verification and an app password. Bulk use can get the
    // account suspended; see README "Email codes without a domain".
    name: "gmail",
    dailyCap: 500,
    configured: (env) => Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD),
    send: async (m, env) => {
      const transport = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
        connectionTimeout: 8000,
        socketTimeout: 8000,
      });
      try {
        // Gmail rewrites any other From to the account itself, so use it directly.
        await transport.sendMail({ from: { name: fromName(env), address: env.GMAIL_USER! }, to: m.to, subject: m.subject, text: m.text, html: m.html });
        return 200;
      } catch (e) {
        return smtpStatus(e as { responseCode?: number; response?: string });
      }
    },
  },
];

/** Maps an SMTP failure to the HTTP status sendEmail understands. */
export function smtpStatus(e: { responseCode?: number; response?: string }): number {
  const code = e.responseCode;
  // 5.4.5 = Gmail daily sending limit; 421/450/451/452 = try later. Both mean "spent for now".
  if (/\b5\.4\.5\b/.test(e.response ?? "") || code === 421 || code === 450 || code === 451 || code === 452) return 429;
  // Bad or unknown recipient: every provider would refuse it.
  if (code === 550 || code === 553 || code === 501) return 422;
  return 503; // auth (535), network, timeouts: move on
}

const COUNTER_TTL = 48 * 3600;
// Free quotas reset daily; counting by UTC day is close enough with the 5% margin.
export const quotaKey = (name: string, now: Date) => `mail:${name}:${now.toISOString().slice(0, 10)}`;

/** The address itself was refused: another provider would refuse it too, so don't fall through. */
export class EmailRejectedError extends Error {}
export class EmailUnavailableError extends Error {}

type Deps = { store?: Store; fetch?: typeof fetch; env?: Env; now?: Date };

/**
 * Sends through the first configured provider with free quota left today and returns its name.
 * 429 marks that provider spent for the day; 5xx, auth and network errors move on at once.
 */
export async function sendEmail(mail: Mail, deps: Deps = {}): Promise<string> {
  const { store = defaultStore, fetch: doFetch = fetch, now = new Date() } = deps;
  const env = deps.env ?? (await serverEnv());
  for (const p of PROVIDERS) {
    if (!p.configured(env)) continue;
    // HTTP providers send from EMAIL_FROM; Gmail sends from its own account.
    if (p.request && !env.EMAIL_FROM) continue;
    const key = quotaKey(p.name, now);
    const limit = Math.floor(p.dailyCap * 0.95);
    if (Number((await store.get(key)) ?? 0) >= limit) continue;

    let status: number | null;
    if (p.send) status = await p.send(mail, env);
    else {
      const { url, init } = p.request!(mail, env);
      status = (await doFetch(url, { ...init, signal: AbortSignal.timeout(8000) }).catch(() => null))?.status ?? null;
    }
    if (status !== null && status >= 200 && status < 300) {
      await store.incr(key, COUNTER_TTL);
      return p.name;
    }
    if (status === 400 || status === 422) {
      throw new EmailRejectedError(`${p.name} rejected the message (${status})`);
    }
    if (status === 429) await store.set(key, String(limit), COUNTER_TTL);
    console.warn(`email: ${p.name} failed (${status ?? "network"}), trying next provider`);
  }
  throw new EmailUnavailableError("No email provider has quota left today");
}

export function codeEmail(to: string, code: string): Mail {
  const note = "It expires in 10 minutes. If you did not ask for it, ignore this email.";
  return {
    to,
    subject: `${code} is your sign-in code`,
    text: `Your sign-in code is ${code}. ${note}`,
    html: `<p>Your sign-in code is</p><p style="font-size:28px;font-weight:600;letter-spacing:6px">${code}</p><p>${note}</p>`,
  };
}

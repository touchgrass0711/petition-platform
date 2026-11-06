import { describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

const { codeEmail, EmailRejectedError, EmailUnavailableError, sendEmail, smtpStatus } = await import("./email");
import { memoryStore } from "./kv";

const env = { EMAIL_FROM: "no-reply@example.com", BREVO_API_KEY: "b", RESEND_API_KEY: "r", MAILJET_API_KEY: "m", MAILJET_SECRET_KEY: "s" };
const mail = codeEmail("signer@example.com", "123456");
const now = new Date("2026-11-02T10:00:00Z");

// Answers by host so each test can make one provider fail.
const fakeFetch = (status: Record<string, number>) =>
  vi.fn(async (url: string | URL | Request) => {
    const host = new URL(String(url)).hostname.split(".").at(-2)!;
    return new Response("{}", { status: status[host] ?? 200 });
  });

describe("sendEmail provider fallback", () => {
  it("uses Brevo first and counts the send", async () => {
    const store = memoryStore();
    const f = fakeFetch({});
    expect(await sendEmail(mail, { store, env, now, fetch: f })).toBe("brevo");
    expect(f).toHaveBeenCalledTimes(1);
    expect(await store.get("mail:brevo:2026-11-02")).toBe("1");
  });

  it("moves to Resend at once on a 5xx, without marking Brevo spent", async () => {
    const store = memoryStore();
    expect(await sendEmail(mail, { store, env, now, fetch: fakeFetch({ brevo: 503 }) })).toBe("resend");
    expect(await store.get("mail:brevo:2026-11-02")).toBeNull();
  });

  it("marks a provider spent for the day on 429 and skips it next time", async () => {
    const store = memoryStore();
    await sendEmail(mail, { store, env, now, fetch: fakeFetch({ brevo: 429 }) });
    const f = fakeFetch({});
    expect(await sendEmail(mail, { store, env, now, fetch: f })).toBe("resend");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("skips a provider at 95% of its daily cap and resets the next day", async () => {
    const store = memoryStore();
    await store.set("mail:brevo:2026-11-02", "285", 3600);
    expect(await sendEmail(mail, { store, env, now, fetch: fakeFetch({}) })).toBe("resend");
    expect(await sendEmail(mail, { store, env, now: new Date("2026-11-03T00:01:00Z"), fetch: fakeFetch({}) })).toBe("brevo");
  });

  it("skips unconfigured providers and falls to Mailjet on network errors", async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("resend")) throw new TypeError("fetch failed");
      return new Response("{}", { status: 200 });
    });
    const noBrevo = { ...env, BREVO_API_KEY: undefined };
    expect(await sendEmail(mail, { store: memoryStore(), env: noBrevo, now, fetch: f })).toBe("mailjet");
  });

  it("does not fall through when the address is rejected", async () => {
    await expect(sendEmail(mail, { store: memoryStore(), env, now, fetch: fakeFetch({ brevo: 400 }) })).rejects.toBeInstanceOf(EmailRejectedError);
  });

  it("fails when every provider is down or nothing is configured", async () => {
    const down = fakeFetch({ brevo: 500, resend: 500, mailjet: 500 });
    await expect(sendEmail(mail, { store: memoryStore(), env, now, fetch: down })).rejects.toBeInstanceOf(EmailUnavailableError);
    await expect(sendEmail(mail, { store: memoryStore(), env: { EMAIL_FROM: "x@example.com" }, now, fetch: down })).rejects.toBeInstanceOf(EmailUnavailableError);
  });
});

describe("Gmail SMTP fallback", () => {
  const gmail = { GMAIL_USER: "campaign@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" };

  it("sends from the Gmail account itself, without EMAIL_FROM, when it is the only provider", async () => {
    sendMail.mockReset().mockResolvedValue({});
    const store = memoryStore();
    expect(await sendEmail(mail, { store, env: gmail, now, fetch: fakeFetch({}) })).toBe("gmail");
    expect(sendMail.mock.calls[0][0]).toMatchObject({ from: { address: "campaign@gmail.com" }, to: "signer@example.com" });
    expect(await store.get("mail:gmail:2026-11-02")).toBe("1");
  });

  it("is used after the HTTP providers fail", async () => {
    sendMail.mockReset().mockResolvedValue({});
    const down = fakeFetch({ brevo: 500, resend: 500, mailjet: 500 });
    expect(await sendEmail(mail, { store: memoryStore(), env: { ...env, ...gmail }, now, fetch: down })).toBe("gmail");
  });

  it("marks Gmail spent for the day on its daily-limit error", async () => {
    sendMail.mockReset().mockRejectedValue({ responseCode: 550, response: "550 5.4.5 Daily user sending limit exceeded" });
    const store = memoryStore();
    await expect(sendEmail(mail, { store, env: gmail, now, fetch: fakeFetch({}) })).rejects.toBeInstanceOf(EmailUnavailableError);
    expect(await store.get("mail:gmail:2026-11-02")).toBe("475");
  });

  it("maps SMTP replies to the fallback rules", () => {
    expect(smtpStatus({ responseCode: 421 })).toBe(429);
    expect(smtpStatus({ responseCode: 550, response: "550 5.1.1 The email account does not exist" })).toBe(422);
    expect(smtpStatus({ responseCode: 535, response: "535 5.7.8 Username and Password not accepted" })).toBe(503);
    expect(smtpStatus({})).toBe(503);
  });
});

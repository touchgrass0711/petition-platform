import type { Metadata } from "next";
import { serverEnv } from "@/lib/server/integrations";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Privacy notice", description: "What we collect when you sign, why, and your choices." };

const EFFECTIVE = "November 5, 2026";

const storage = [
  ["Signer session (sessionStorage)", "Keeps you signed in while the tab is open", "Until the tab closes", "Necessary"],
  ["Sign-in token (IndexedDB, Firebase Auth)", "Proves who you are when you sign or edit", "Until you sign out", "Necessary"],
  ["Cloudflare Turnstile", "Tells people from bots", "Short-lived", "Necessary"],
  ["Theme (localStorage)", "Remembers light or dark mode", "Until you clear it", "Functional"],
];

export default async function PrivacyPage() {
  const env = await serverEnv();
  // The campaign owner, not the developer. Contact falls back to the dedicated Gmail that sends sign-in codes.
  const controller = env.PRIVACY_CONTROLLER_NAME || "DAWN";
  const contact = env.PRIVACY_CONTACT_EMAIL || env.GMAIL_USER;
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pt-16 pb-12 text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Privacy notice</h1>
        <p className="text-muted-foreground">Effective {EFFECTIVE}</p>
      </header>

      <section className="space-y-2">
        <h2>Who we are</h2>
        <p>
          {controller} runs this petition and decides how your data is used. How to reach us is at the end of this notice.
        </p>
      </section>

      <section className="space-y-2">
        <h2>What we collect</h2>
        <ul>
          <li>
            When you sign: your comment, your name (unless you sign anonymously, which is the default; the name is then not stored), and
            a photo if you add one or sign in with Google.
          </li>
          <li>
            Your email address, to send your sign-in code or to read it from your Google account. We store only a coded fingerprint of it,
            so you can sign once and edit later; your email itself is not kept in our database.
          </li>
          <li>Your IP address, to stop spam, abuse and fake signatures (rate limits and bot checks).</li>
          <li>
            Usage statistics: pages viewed, clicks, referring site, device and browser type and approximate location derived from your IP
            address. No analytics cookies are set; each visit is counted separately.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2>How we use it</h2>
        <ul>
          <li>
            To record, count and show your signature, and to deliver the petition&apos;s comments and public names to the people or
            organisation it is addressed to.
          </li>
          <li>To send your sign-in code. We send no marketing email.</li>
          <li>
            To keep the site secure, stop fake signatures and understand how the site is used.
          </li>
        </ul>
        <p>Signing a petition can show your views. We use your signature only for this petition. We do not sell your personal data or share it for advertising.</p>
      </section>

      <section className="space-y-2">
        <h2>Who processes it, and where</h2>
        <p>
          These service providers process data for us under their terms: Google Firebase (database and sign-in), Vercel (hosting), Upstash
          (rate limits), Cloudflare Turnstile (bot checks), PostHog (statistics), and Brevo, Resend, Mailjet or Google Gmail (sending
          sign-in codes). Some may store data outside your state or country. Apart from them and the petition&apos;s recipients, we share your data with no one.
        </p>
      </section>

      <section className="space-y-2">
        <h2>How long we keep it</h2>
        <ul>
          <li>Your signature, comment, name and photo: while the petition is open and up to 12 months after it closes, then deleted.</li>
          <li>Sign-in codes: 10 minutes. Rate-limit records tied to your IP address or email: up to 48 hours.</li>
          <li>Usage statistics: as long as PostHog keeps them under our account settings.</li>
        </ul>
        <p>You can delete your signature sooner yourself, or ask us to.</p>
      </section>

      <section className="space-y-2">
        <h2>Your rights</h2>
        <ul>
          <li>Edit or delete your signature at any time from the account menu after signing in.</li>
          <li>
            Ask us for a copy of your data, or to correct, delete or stop using it. You can withdraw your consent at any time; this does not
            affect what we did before.
          </li>
          <li>We will not treat you differently for using these rights.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2>How we respond to Do Not Track</h2>
        <p>
          We treat every visitor the same whether or not the browser sends a Do Not Track signal, because we do not track you across
          other sites and we allow no third party to do so through this site.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Children</h2>
        <p>You must be 13 or older to sign. We do not knowingly collect data from children under 13; if we learn of it, we delete it.</p>
      </section>

      <section className="space-y-2">
        <h2>Browser storage</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2">Purpose</th>
                <th className="py-2 pr-2">Kept</th>
                <th className="py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {storage.map(([item, purpose, kept, type]) => (
                <tr key={item} className="border-b align-top">
                  <td className="py-2 pr-2">{item}</td>
                  <td className="py-2 pr-2">{purpose}</td>
                  <td className="py-2 pr-2">{kept}</td>
                  <td className="py-2">{type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>You can clear all of these in your browser settings.</p>
      </section>

      <section className="space-y-2">
        <h2>Changes and contact</h2>
        <p>If we change this notice, we update the date above and tell you here before the change applies. If a breach affects your data, we will tell you as the law requires.</p>
        <p>
          Questions or requests:{" "}
          {contact ? (
            <a className="underline" href={`mailto:${contact}`}>
              {contact}
            </a>
          ) : (
            "reply to any sign-in email from this site"
          )}
          .
        </p>
      </section>
    </main>
  );
}

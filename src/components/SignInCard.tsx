"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { track } from "@/lib/analytics";
import { codeSchema, emailSchema } from "@/lib/schemas";
import { usePublicConfig } from "@/app/providers";
import { GoogleSignIn } from "./GoogleSignIn";

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

/** Email → 6-digit code. In Demo Mode the server returns the code instead of emailing it. */
export function SignInCard({ onSignedIn }: { onSignedIn: (email: string, photo?: string | null) => void }) {
  const { turnstileSiteKey, googleSignin } = usePublicConfig();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof TypeError ? "Network error. Please try again." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const requestCode = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    run(async () => {
      const data = await post("/api/auth/code", { email: parsed.data, turnstileToken: token });
      setEmail(parsed.data);
      setDemoCode(data.demoCode ?? null);
      track("code_sent");
      setStep("code");
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    run(async () => {
      const data = await post("/api/auth/verify", { email, code: parsed.data });
      // Live mode only: the server returns a Firebase custom token; Demo Mode creates no account.
      if (data.token) {
        const [{ signInWithCustomToken }, { clientAuth }] = await Promise.all([import("firebase/auth"), import("@/lib/firebase/client")]);
        await signInWithCustomToken(clientAuth(), data.token);
      }
      track("code_verified");
      onSignedIn(email);
    });
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Sign the petition</CardTitle>
        <CardDescription>
          {step === "email" ? "Sign in first. One signature per person." : `Enter the 6-digit code for ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email" ? (
          <>
            {googleSignin && (
              <>
                <GoogleSignIn onSignedIn={onSignedIn} />
                <p className="my-4 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                  or use your email
                </p>
              </>
            )}
            <form onSubmit={requestCode} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => !started && (setStarted(true), track("sign_started"))} />
                <p className="text-xs text-muted-foreground">Used only to sign you in and stop duplicate signatures.</p>
              </div>
              <Turnstile siteKey={turnstileSiteKey} onSuccess={setToken} onExpire={() => setToken(null)} options={{ size: "flexible" }} />
              <Button type="submit" size="lg" className="w-full" disabled={busy || !token}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />} Send code
              </Button>
            </form>
          </>
        ) : (
          <form onSubmit={verify} className="space-y-4" noValidate>
            {demoCode && (
              <div role="status" className="rounded-lg border border-dashed bg-muted/50 p-3 text-sm">
                <p className="font-medium">Demo Mode: no email was sent.</p>
                <p className="text-muted-foreground">
                  Your code is <code className="text-base font-semibold tracking-widest text-foreground">{demoCode}</code>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="signin-code">Code</Label>
              <Input id="signin-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className="tracking-widest" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Verify and continue
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setStep("email"); setCode(""); setDemoCode(null); setToken(null); setError(null); }}>
              Use a different email
            </Button>
          </form>
        )}
        {error && <p role="alert" className="mt-3 text-center text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

"use client";

import { Loader2, Megaphone } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { signIn } from "@/lib/admin-session";
import { DEMO_ADMIN, DEMO_MODE } from "@/lib/demo";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await signIn(String(form.get("email")), String(form.get("password")));
    } catch {
      setError("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm rounded-2xl shadow-lg">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Megaphone className="size-5" aria-hidden />
          </span>
          <CardTitle className="text-xl">Admin login</CardTitle>
          <CardDescription>Sign in to manage the petition.</CardDescription>
        </CardHeader>
        <CardContent>
          {DEMO_MODE && (
            <div className="mb-4 rounded-lg border border-dashed bg-muted/50 p-3 text-sm">
              <p className="font-medium">View-only demo account</p>
              <p className="text-muted-foreground">Email: <code className="text-foreground">{DEMO_ADMIN.email}</code></p>
              <p className="text-muted-foreground">Password: <code className="text-foreground">{DEMO_ADMIN.password}</code></p>
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

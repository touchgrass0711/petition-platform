import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { publicConfig } from "@/lib/public-config";
import { serverEnv } from "@/lib/server/integrations";
import { Providers } from "./providers";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { colorScheme: "dark light", themeColor: "#0a0a0a" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // next-themes sets the class before paint; the attribute differs from the server HTML by design.
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <Providers config={publicConfig(await serverEnv())}>{children}</Providers>
        <footer className="mx-auto max-w-2xl border-t px-4 py-6 text-center text-sm text-muted-foreground">
          © 2026 OUTSET.ID. All rights reserved. ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </footer>
      </body>
    </html>
  );
}

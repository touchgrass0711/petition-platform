"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import posthog from "posthog-js";
import { createContext, useContext, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { publicConfig, type PublicConfig } from "@/lib/public-config";

const PublicConfigContext = createContext<PublicConfig>(publicConfig({}));
/** Turnstile site key, PostHog key and Google switch, as resolved on the server for this render. */
export const usePublicConfig = () => useContext(PublicConfigContext);

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="bottom-center" theme={resolvedTheme === "light" ? "light" : "dark"} />;
}

export function Providers({ children, config }: { children: React.ReactNode; config: PublicConfig }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000 } } }));
  useEffect(() => {
    const key = config.posthogKey;
    // Memory persistence: no analytics cookies, so no consent banner (see /privacy).
    if (key) posthog.init(key, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com", persistence: "memory" });
  }, [config.posthogKey]);
  return (
    // Dark by default regardless of OS setting; the toggle's choice is kept in localStorage.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <PublicConfigContext.Provider value={config}>{children}</PublicConfigContext.Provider>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

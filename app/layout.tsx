import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { McpStoreProvider } from "@/components/providers/McpStoreProvider";
import { WebLanguageProvider } from "@/components/providers/WebLanguageProvider";
import QueryProvider from "@/components/providers/QueryProvider";
import { createClient } from "@/lib/supabase/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "react-hot-toast";
import { geist, inter, geistMono } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "MCP Assistant",
  description: "Web-based MCP (Model Context Protocol) client for managing servers and exploring tools",
  icons: {
    icon: "/favicon.ico",
  },
  verification: {
    google: "Not4GrBnowoe9oFiAJ1p11C-olKqFaDIuPV-19X8tBo",
  },
  other: {
    "Cache-Control": "public, max-age=31536000, immutable",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${inter.variable} ${geistMono.variable}`}>
      <body className="antialiased font-sans">
        <AuthProvider userSession={user ? { user } : null}>
          <QueryProvider>
            <McpStoreProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <TooltipProvider delayDuration={150}>
                  <WebLanguageProvider />
                  <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
                  {children}
                </TooltipProvider>
              </ThemeProvider>
            </McpStoreProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

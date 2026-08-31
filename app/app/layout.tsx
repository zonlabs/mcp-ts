import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { McpProvider } from "@/components/providers/McpProvider";
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
            <McpProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <TooltipProvider delayDuration={150}>
                  <WebLanguageProvider />
                  {children}
                  <Toaster
                    position="bottom-right"
                    toastOptions={{
                      duration: 3000,
                      style: {
                        background: 'var(--card)',
                        color: 'var(--card-foreground)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-sans)',
                        boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.25)',
                        padding: '8px 12px',
                      },
                      success: {
                        iconTheme: {
                          primary: '#10b981',
                          secondary: 'var(--card)',
                        },
                      },
                      error: {
                        iconTheme: {
                          primary: '#ef4444',
                          secondary: 'var(--card)',
                        },
                      },
                    }}
                  />
                </TooltipProvider>
              </ThemeProvider>
            </McpProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

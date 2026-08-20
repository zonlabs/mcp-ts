import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { McpStoreProvider } from "@/components/providers/McpStoreProvider";
import { WebLanguageProvider } from "@/components/providers/WebLanguageProvider";
import QueryProvider from "@/components/providers/QueryProvider";
import { createClient } from "@/lib/supabase/server";
import { inter, geistMono, jetbrainsMono, instrumentSerif } from "@/lib/fonts";

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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}>
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
                <WebLanguageProvider />
                {children}
              </ThemeProvider>
            </McpStoreProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

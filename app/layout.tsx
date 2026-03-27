import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import { ApolloProvider } from "@/components/providers/ApolloProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { McpStoreProvider } from "@/components/providers/McpStoreProvider";

export const metadata: Metadata = {
  title: "MCP Assistant",
  description: "Web-based MCP (Model Context Protocol) client for managing servers and exploring tools",
  icons: {
    icon: "/favicon.ico",
  },
  verification: {
    google: "Not4GrBnowoe9oFiAJ1p11C-olKqFaDIuPV-19X8tBo",
  },
};

import { createClient } from "@/lib/supabase/server";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Cast session to any to satisfy UserSession type which extends Session
  const userSession = session as any;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AuthProvider userSession={userSession}>
          <ApolloProvider>
            <McpStoreProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                {children}
              </ThemeProvider>
            </McpStoreProvider>
          </ApolloProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

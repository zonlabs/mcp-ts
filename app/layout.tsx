import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { McpStoreProvider } from "@/components/providers/McpStoreProvider";
import { WebLanguageProvider } from "@/components/providers/WebLanguageProvider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AuthProvider>
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
        </AuthProvider>
      </body>
    </html>
  );
}

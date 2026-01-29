import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MCP Redis Next.js Example',
  description: 'Example application demonstrating @mcp-ts/sdk with Next.js',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

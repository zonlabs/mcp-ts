import Link from "next/link";
import Image from "next/image";
import { Home, LayoutGrid, MessageSquarePlus } from "lucide-react";

const links = [
  { label: "Home", href: "/", icon: Home },
  { label: "Apps", href: "/mcp", icon: LayoutGrid },
  { label: "New Chat", href: "/chat", icon: MessageSquarePlus },
];

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center">
          <Image
            src="/logo.svg"
            alt="MCP Assistant"
            width={48}
            height={48}
            className="rounded-md"
            priority
          />
        </div>

        <p className="mb-3 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          404
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
          The page you are looking for does not exist or may have moved.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

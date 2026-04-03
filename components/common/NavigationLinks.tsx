"use client";
import { Home, Server, MessageSquare, Package, BookOpen, GitFork } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavigationLinks() {
  const pathname = usePathname();

  const navLinkClass = (isActive: boolean) => `flex items-center gap-2 text-sm font-medium transition-colors relative group ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  const underlineClass = `absolute bottom-[-4px] left-1/2 -translate-x-1/2 h-0.5 bg-primary transition-all duration-300 ease-out w-0 group-hover:w-full`;

  return (
    <div className="flex items-center justify-center gap-6">
      <Link href="/" className={navLinkClass(pathname === "/")}>
        <Home className="h-4 w-4" />
        Home
        <span className={underlineClass} />
      </Link>
      <Link href="/mcp" className={navLinkClass(pathname === "/mcp")}>
        <Server className="h-4 w-4" />
        MCP
        <span className={underlineClass} />
      </Link>
      <Link href="/registry" className={navLinkClass(pathname === "/registry")}>
        <Package className="h-4 w-4" />
        Registry
        <span className={underlineClass} />
      </Link>
      <Link
        href="/workflows"
        className={navLinkClass(pathname === "/workflows" || pathname.startsWith("/workflows/"))}
      >
        <GitFork className="h-4 w-4" />
        Workflows
        <span className={underlineClass} />
      </Link>
      <Link href="/chat" className={navLinkClass(pathname === "/chat")}>
        <MessageSquare className="h-4 w-4" />
        Chat
        <span className={underlineClass} />
      </Link>
      <Link
        href="https://zonlabs.github.io/mcp-ts/"
        target="_blank"
        rel="noopener noreferrer"
        className={navLinkClass(false)}
      >
        <BookOpen className="h-4 w-4" />
        Docs
        <span className={underlineClass} />
      </Link>
    </div>
  );
}

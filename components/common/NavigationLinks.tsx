"use client";
import { Home, MessageSquare, Package, BookOpen, Workflow, Hammer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavigationLinks() {
  const pathname = usePathname();

  const navLinkClass = (isActive: boolean) => `flex items-center gap-2 text-sm font-medium transition-colors relative group ${isActive ? "text-foreground" : "text-foreground/80 hover:text-foreground"}`;

  const underlineClass = `absolute bottom-[-4px] left-1/2 -translate-x-1/2 h-0.5 bg-primary transition-all duration-300 ease-out w-0 group-hover:w-full`;

  const iconProps = {
    className: "h-4 w-4",
    strokeWidth: 2,
  };

  return (
    <div className="flex items-center justify-center gap-6">
      <Link href="/" className={navLinkClass(pathname === "/")}>
        <Home {...iconProps} />
        Home
        <span className={underlineClass} />
      </Link>
      <Link href="/mcp" className={navLinkClass(pathname === "/mcp")}>
        <Hammer {...iconProps} />
        MCP
        <span className={underlineClass} />
      </Link>
      <Link href="/registry" className={navLinkClass(pathname === "/registry")}>
        <Package {...iconProps} />
        Registry
        <span className={underlineClass} />
      </Link>
      <Link
        href="/workflows"
        className={navLinkClass(pathname === "/workflows" || pathname.startsWith("/workflows/"))}
      >
        <Workflow {...iconProps} />
        Workflows
        <span className={underlineClass} />
      </Link>
      <Link href="/chat" className={navLinkClass(pathname === "/chat")}>
        <MessageSquare {...iconProps} />
        Chat
        <span className={underlineClass} />
      </Link>
      <Link
        href="https://docs.mcp-assistant.in/"
        target="_blank"
        rel="noopener noreferrer"
        className={navLinkClass(false)}
      >
        <BookOpen {...iconProps} />
        Docs
        <span className={underlineClass} />
      </Link>
    </div>
  );
}

"use client";
import { useState, useRef, useEffect } from "react";
import { Home, MessageSquare, Package, BookOpen, Hammer, ChevronDown, Shield, KeyRound, Activity, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/web-i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function NavigationLinks() {
  const pathname = usePathname();
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleClose = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const navLinkClass = (isActive: boolean) => `flex items-center gap-2 text-base font-medium transition-colors relative group ${isActive ? "text-foreground" : "text-foreground/80 hover:text-foreground"}`;

  const underlineClass = `absolute bottom-[-4px] left-1/2 -translate-x-1/2 h-0.5 bg-primary transition-all duration-300 ease-out w-0 group-hover:w-full`;

  const iconProps = {
    className: "h-4 w-4",
    strokeWidth: 2,
  };

  return (
    <div className="flex items-center justify-center gap-6">
      <Link href="/" className={navLinkClass(pathname === "/")}>
        <Home {...iconProps} />
        {t("home")}
        <span className={underlineClass} />
      </Link>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            onMouseEnter={handleOpen}
            onMouseLeave={handleClose}
            className={cn(navLinkClass(pathname.startsWith("/mcp")), "cursor-pointer focus:outline-none flex items-center gap-1.5 select-none font-serif")}
          >
            <Hammer {...iconProps} />
            MCP
            <ChevronDown className="h-4 w-4 opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
            <span className={underlineClass} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
          align="center"
          className="w-48"
        >
          <DropdownMenuItem asChild>
            <Link href="/mcp" className="w-full flex items-center gap-2 cursor-pointer">
              <Hammer className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              Browse Servers
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/mcp?view=activity&tab=mcp-server" className="w-full flex items-center gap-2 cursor-pointer">
              <Activity className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              Activity
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/mcp?view=activity&tab=tool-policy" className="w-full flex items-center gap-2 cursor-pointer">
              <Shield className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              Tool Policy
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/mcp?view=activity&tab=revoke" className="w-full flex items-center gap-2 cursor-pointer">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              Revoke Access
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/connectors" className="w-full flex items-center gap-2 cursor-pointer">
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              Add Connector
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Link href="/registry" className={navLinkClass(pathname === "/registry")}>
        <Package {...iconProps} />
        {t("registry")}
        <span className={underlineClass} />
      </Link>
      <Link href="/chat" className={navLinkClass(pathname === "/chat")}>
        <MessageSquare {...iconProps} />
        {t("chat")}
        <span className={underlineClass} />
      </Link>
      <Link
        href="https://docs.mcp-assistant.in/"
        target="_blank"
        rel="noopener noreferrer"
        className={navLinkClass(false)}
      >
        <BookOpen {...iconProps} />
        {t("docs")}
        <span className={underlineClass} />
      </Link>
    </div>
  );
}

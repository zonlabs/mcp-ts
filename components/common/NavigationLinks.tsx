"use client";
import { useState } from "react";
import { Home, MessageSquare, Package, BookOpen, Hammer, ChevronDown, Shield, KeyRound, Activity, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/web-i18n";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function NavigationLinks() {
  const pathname = usePathname();
  const { t } = useI18n();

  const [open, setOpen] = useState(false);

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
      
      {/* Hover Dropdown Container */}
      <div 
        className="relative py-1.5"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          className={cn(navLinkClass(pathname.startsWith("/mcp")), "cursor-pointer focus:outline-none flex items-center gap-1.5 select-none font-serif")}
        >
          <Hammer {...iconProps} />
          MCP
          <ChevronDown className="h-4 w-4 opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
          <span className={underlineClass} />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md z-[1000]"
            >
              <Link 
                href="/mcp" 
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <Hammer className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                Browse Servers
              </Link>
              <div className="-mx-1 my-1 h-px bg-border" />
              <Link 
                href="/mcp?view=activity&tab=mcp-server" 
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <Activity className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                Activity
              </Link>
              <Link 
                href="/mcp?view=activity&tab=tool-policy" 
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <Shield className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                Tool Policy
              </Link>
              <Link 
                href="/mcp?view=activity&tab=revoke" 
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                Revoke Access
              </Link>
              <div className="-mx-1 my-1 h-px bg-border" />
              <Link 
                href="/mcp?view=add" 
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                Add Connector
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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

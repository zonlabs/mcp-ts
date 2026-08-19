"use client";
import { useState } from "react";
import { Home, MessageSquare, BookOpen, Hammer, ChevronDown, Shield, KeyRound, Activity, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/web-i18n";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function NavigationLinks() {
  const pathname = usePathname();
  const { t } = useI18n();

  const [open, setOpen] = useState(false);

  const navLinkClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-1.5 text-xs sm:text-[13px] font-medium transition-colors px-2.5 py-1 rounded-sm relative select-none",
      isActive
        ? "text-foreground font-semibold bg-card/60"
        : "text-muted-foreground hover:text-foreground hover:bg-card/40"
    );

  const iconProps = {
    className: "h-3.5 w-3.5 shrink-0",
    strokeWidth: 2,
  };

  return (
    <div className="flex items-center justify-center gap-1 font-sans">
      <Link href="/" className={navLinkClass(pathname === "/")}>
        <Home {...iconProps} />
        <span>{t("home")}</span>
      </Link>

      {/* Hover Dropdown Container */}
      <div
        className="relative py-1"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <Link
          href="/mcp"
          className={cn(navLinkClass(pathname.startsWith("/mcp")), "cursor-pointer")}
        >
          <Hammer {...iconProps} />
          <span>MCP Hub</span>
          <ChevronDown className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity ml-0.5" strokeWidth={2} />
        </Link>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-52 rounded-md border border-border bg-card p-1 text-foreground shadow-2xl z-[1000]"
            >
              <Link
                href="/mcp"
                className="flex items-center gap-2 rounded-xs px-2.5 py-1.5 text-xs hover:bg-background transition-colors cursor-pointer w-full text-left font-medium"
                onClick={() => setOpen(false)}
              >
                <Hammer className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                Server Dashboard
              </Link>
              <div className="-mx-1 my-1 h-px bg-border" />
              <Link
                href="/mcp?view=activity&tab=mcp-server"
                className="flex items-center gap-2 rounded-xs px-2.5 py-1.5 text-xs hover:bg-background transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <Activity className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                Activity & Logs
              </Link>
              <Link
                href="/mcp?view=activity&tab=tool-policy"
                className="flex items-center gap-2 rounded-xs px-2.5 py-1.5 text-xs hover:bg-background transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                Tool Policies
              </Link>
              <Link
                href="/mcp?view=activity&tab=revoke"
                className="flex items-center gap-2 rounded-xs px-2.5 py-1.5 text-xs hover:bg-background transition-colors cursor-pointer w-full text-left"
                onClick={() => setOpen(false)}
              >
                <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                Token Revocation
              </Link>
              <div className="-mx-1 my-1 h-px bg-border" />
              <Link
                href="/mcp?view=add"
                className="flex items-center gap-2 rounded-xs px-2.5 py-1.5 text-xs hover:bg-background transition-colors cursor-pointer w-full text-left font-medium text-foreground"
                onClick={() => setOpen(false)}
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                Add MCP Server
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Link href="/chat" className={navLinkClass(pathname === "/chat")}>
        <MessageSquare {...iconProps} />
        <span>Playground</span>
      </Link>

      <Link
        href="https://docs.mcp-assistant.in/"
        target="_blank"
        rel="noopener noreferrer"
        className={navLinkClass(false)}
      >
        <BookOpen {...iconProps} />
        <span>{t("docs")}</span>
      </Link>
    </div>
  );
}

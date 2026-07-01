"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Home, Hammer, MessageSquare, Package, BookOpen, GitFork } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const toggleMenu = () => setIsOpen((prev) => !prev);

  const navLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/mcp", label: "MCP", icon: Hammer },
    { href: "/registry", label: "Registry", icon: Package },
    { href: "/workflows", label: "Workflows", icon: GitFork },
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "https://docs.mcp-assistant.in/", label: "Docs", icon: BookOpen, external: true },
  ];

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMenu}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleMenu}
              className="fixed inset-0 z-[210] bg-background/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              style={{ willChange: 'transform' }}
              className="font-sans-original fixed inset-y-0 left-0 z-[211] w-[min(20rem,calc(100vw-2rem))] bg-background p-6 tracking-normal shadow-xl"
            >
              <div className="mb-8 flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={toggleMenu}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex flex-col space-y-3">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = !link.external && pathname === link.href;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={toggleMenu}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className={`flex items-center gap-3 rounded-full border px-4 py-3 text-sm font-medium transition-colors
                        ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card/90 text-foreground border-border hover:bg-muted hover:text-foreground"
                        }
                      `}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

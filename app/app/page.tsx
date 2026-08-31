"use client";
import Link from "next/link";
import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  ArrowUpRight,
  Layers,
  Search,
  Terminal,
  Github,
} from "lucide-react";
import Footer from "@/components/home/Footer";
import { LogoBadge } from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useAuth } from "@/components/providers/AuthProvider";
import Image from "next/image";
import { motion, Variants } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  SimpleTooltip,
} from "@/components/ui/tooltip";
import { HeroGridPattern } from "@/components/home/hero-grid-pattern";
import { Stack } from "@/components/stack";

// -------------------------------------------------------------------
// Animation Variants
// -------------------------------------------------------------------
const container: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.6,
      when: "beforeChildren",
      staggerChildren: 0.12,
    },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94] as const
    },
  },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }
};

export default function Home() {
  const [copied, setCopied] = useState(false);
  const { userSession } = useAuth();

  const copyInstallCommand = async () => {
    const command = "npm install @mcp-ts/client";
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-foreground">
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="group">
            <LogoBadge />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="https://github.com/zonlabs/mcp-ts"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-sm hover:bg-muted/50 flex items-center justify-center"
              aria-label="GitHub Repository"
            >
              <Github className="size-4" />
            </Link>
            <ThemeToggle />
            {userSession?.user ? (
              <Link
                href="/mcp"
                className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-sm text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/signin"
                className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-sm text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto min-h-0">
        {/* Hero Section */}
        <Stack
          dir="column"
          justify="center"
          items="center"
          className="min-h-[calc(100vh-3.5rem)] sm:h-[90vh] overflow-visible relative"
        >
          <HeroGridPattern />

          <Stack gap={3} className="z-50 w-full pointer-events-none">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={container}
              className="relative w-full flex flex-col items-center justify-center px-3 sm:px-6"
            >
              <div className="relative z-10 w-full max-w-4xl mx-auto text-center px-4 sm:px-6">
                <motion.h1
                  variants={item}
                  className="text-4xl sm:text-6xl md:text-[4.5rem] lg:text-[5rem] font-normal tracking-[-0.035em] leading-[1.08] mb-6 text-foreground"
                >
                  Every resource is
                  <br className="hidden sm:block" />
                  {" "}
                  <span className="text-red-500 dark:text-red-400 font-normal">context</span>
                  {" "}
                  for your AI
                </motion.h1>

                <motion.p
                  variants={item}
                  className="mx-auto max-w-2xl text-base sm:text-lg md:text-[1.125rem] font-normal text-foreground/80 dark:text-foreground/75 leading-[1.55] mb-8 tracking-[-0.01em]"
                >
                  Connect remote MCP servers, set granular tool-execution policies for your AI, and give agents access to tools, prompts, and resources—all from one place.
                </motion.p>

                <motion.div
                  variants={item}
                  className="grid w-full max-w-[280px] grid-cols-2 gap-3 mb-8 pointer-events-auto mx-auto"
                >
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Link
                      href="/mcp"
                      className="inline-flex w-full items-center justify-center px-3 py-2 rounded-sm text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-2xs"
                    >
                      Explore
                    </Link>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Link
                      href="/chat"
                      className="inline-flex w-full items-center justify-center px-3 py-2 rounded-sm text-sm font-medium border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition"
                    >
                      Playground
                    </Link>
                  </motion.div>
                </motion.div>

                <motion.div
                  variants={item}
                  className="mt-6 flex flex-col items-center gap-3.5 w-full"
                >
                  <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80 font-medium text-center">
                    Connect your AI to 100+ platforms instantly
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 max-w-3xl mx-auto">
                    {[
                      { name: "GitHub", icon: "https://logos.composio.dev/api/github" },
                      { name: "Gmail", icon: "https://logos.composio.dev/api/gmail" },
                      { name: "Google Docs", icon: "https://logos.composio.dev/api/googledocs" },
                      { name: "X", icon: "https://logos.composio.dev/api/twitter" },
                      { name: "Notion", icon: "https://logos.composio.dev/api/notion" },
                      { name: "Netlify", icon: "https://logos.composio.dev/api/netlify" },
                      { name: "Heroku", icon: "https://logos.composio.dev/api/heroku" },
                      { name: "Cloudinary", icon: "https://logos.composio.dev/api/cloudinary" },
                      { name: "Higgsfield", icon: "https://logos.composio.dev/api/higgsfield" },
                      { name: "Perplexity", icon: "https://logos.composio.dev/api/perplexityai" },
                      { name: "Calendly", icon: "https://logos.composio.dev/api/calendly" },
                      { name: "Mem0", icon: "https://logos.composio.dev/api/mem0" },
                      { name: "Context 7", icon: "https://logos.composio.dev/api/context7" },
                      { name: "Firecrawl", icon: "https://logos.composio.dev/api/firecrawl" },
                      { name: "Parallel Search", icon: "https://logos.composio.dev/api/parallel", invert: true },
                      { name: "Exa", icon: "https://logos.composio.dev/api/exa" },
                    ].map((plat) => (
                      <SimpleTooltip key={plat.name} content={plat.name} side="top">
                        <div
                          className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-card/40 backdrop-blur-xs transition-all duration-200 hover:scale-110 hover:bg-card/75 p-1"
                        >
                          <Image
                            src={plat.icon}
                            alt={plat.name}
                            width={36}
                            height={36}
                            className={`h-8 w-8 sm:h-9 sm:w-9 object-contain rounded-xs ${plat.invert ? "dark:invert" : ""}`}
                            unoptimized
                          />
                        </div>
                      </SimpleTooltip>
                    ))}
                  </div>
                </motion.div>

              </div>
            </motion.div>
          </Stack>
        </Stack>

        {/* About Section */}
        <section className="py-16 sm:py-20 relative overflow-hidden border-t border-border/40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="text-center max-w-3xl mx-auto mb-14 space-y-4"
            >
              <motion.span variants={fadeInUp} className="inline-block text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                Architecture & Foundation
              </motion.span>
              <motion.h2
                variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-[44px] font-normal sm:font-[450] tracking-[-0.03em] leading-[1.15] text-foreground"
              >
                A toolkit for building with MCP
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto tracking-[-0.01em]"
              >
                The{" "}
                <Link href="https://modelcontextprotocol.io/docs/getting-started/intro" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
                  Model Context Protocol
                </Link>{" "}
                makes it possible for AI apps to use tools and data, but building on top of it requires sessions, OAuth flows, storage, reconnects, and framework integrations.{" "}
                <span className="font-medium text-foreground">mcp-ts</span> takes care of that application layer so you can focus on building your app.
              </motion.p>

              <motion.div
                variants={fadeInUp}
                className="mt-10 grid sm:grid-cols-2 gap-x-8 gap-y-6 max-w-2xl mx-auto text-left pt-2"
              >
                {[
                  { title: "Multi-user sessions", desc: "Persist and restore MCP connections per user across restarts with pluggable storage backends." },
                  { title: "OAuth 2.1 handling", desc: "Full authorization flow — redirect, token exchange, and automatic refresh out of the box." },
                  { title: "Framework adapters", desc: "Built-in adapters for AI SDK, LangChain, Mastra, and AG-UI Protocol." },
                  { title: "ToolRouter", desc: "On-demand tool discovery across servers. Loads only what each request needs, reducing context bloat." },
                  { title: "No vendor lock-in", desc: "Your MCP data stays in infrastructure you control — Redis, SQLite, Neon, Supabase, or memory." },
                  { title: "CodeMode sandbox", desc: "Run programmatic tool calls inside a secure sandbox, avoiding expensive LLM tool-calling loops." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3 items-start">
                    <div className="shrink-0 mt-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div>
                      <h3 className="font-medium text-sm text-foreground">{item.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Packages Section */}
        <section className="py-16 sm:py-20 relative border-t border-border/40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="text-center max-w-2xl mx-auto mb-12 space-y-3"
            >
              <motion.span variants={fadeInUp} className="inline-block text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                Open Source Libraries
              </motion.span>
              <motion.h2
                variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-[44px] font-normal sm:font-[450] tracking-[-0.03em] leading-[1.15] text-foreground"
              >
                Core Packages
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-muted-foreground text-base sm:text-lg leading-relaxed tracking-[-0.01em]"
              >
                Modular, lightweight, and framework-agnostic TypeScript packages designed for production.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto"
            >
              {[
                {
                  icon: <Layers className="h-6 w-6" />,
                  title: "@mcp-ts/client",
                  desc: "Core SDK with multi-backend session storage, OAuth 2.1 handling, SSE support, React/Vue hooks, and adapters for AI SDK, LangChain, and Mastra.",
                  href: "https://github.com/zonlabs/mcp-ts/tree/main/packages/sdk"
                },
                {
                  icon: <Search className="h-6 w-6" />,
                  title: "@mcp-ts/tool-router",
                  desc: "On-demand tool discovery across multiple MCP servers. Reduces LLM context bloat by dynamically loading only relevant tools for each prompt.",
                  href: "https://github.com/zonlabs/mcp-ts/tree/main/packages/tool-router"
                },
                {
                  icon: <Terminal className="h-6 w-6" />,
                  title: "@mcp-ts/codemode",
                  desc: "Sandboxed program execution for tool calling. Runs results inside a secure environment, avoiding expensive recursive tool-calling loops.",
                  href: "https://github.com/zonlabs/mcp-ts/tree/main/packages/code-mode"
                }
              ].map((pkg, i) => (
                <motion.div
                  key={i}
                  variants={item}
                  whileHover={{ y: -3 }}
                  className="group flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-card p-6 sm:p-7 transition-all duration-200 hover:border-primary/40 hover:shadow-xs"
                >
                  <div className="space-y-4">
                    <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-transform duration-200 group-hover:scale-105 shadow-2xs">
                      {pkg.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors">
                        <a href={pkg.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {pkg.title}
                        </a>
                      </h3>
                      <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                        {pkg.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Remote MCP Server Section */}
        <section className="py-16 sm:py-20 relative border-t border-border/40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="max-w-3xl mx-auto text-center"
            >
              <motion.span variants={fadeInUp} className="inline-block text-xs font-mono uppercase tracking-wider text-primary font-semibold mb-3">
                Cloud Endpoint
              </motion.span>
              <motion.h2
                variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-[44px] font-normal sm:font-[450] tracking-[-0.03em] leading-[1.15] text-foreground mb-4"
              >
                Remote MCP Server
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8 tracking-[-0.01em]"
              >
                A hosted Streamable HTTP endpoint providing instant access to 100+ app connectors, tool discovery, and CodeMode execution.
              </motion.p>

              <motion.div
                variants={fadeInUp}
                className="flex items-center gap-3 rounded-lg border border-border/80 bg-muted/40 pl-3.5 pr-2 py-1.5 text-xs sm:text-sm mb-10 max-w-fit mx-auto shadow-2xs"
              >
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold select-none">Endpoint</span>
                <div className="h-3.5 w-px bg-border" />
                <code className="font-mono text-xs sm:text-sm text-foreground inline-flex items-center gap-2">
                  https://api.mcp-assistant.in/mcp
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            const url = "https://api.mcp-assistant.in/mcp";
                            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                              navigator.clipboard.writeText(url);
                            }
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 transition-colors"
                          aria-label="Copy endpoint URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Copy</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </code>
              </motion.div>

              <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl mx-auto mb-6">
                {([
                  ["Calendar", "googlecalendar"],
                  ["HubSpot", "hubspot"],
                  ["Linear", "linear"],
                  ["Supabase", "supabase"],
                  ["Stripe", "stripe"],
                  ["Zoom", "zoom"],
                  ["GitLab", "gitlab"],
                  ["Exa", "exa"],
                  ["Twilio", "twilio"],
                  ["Trello", "trello"],
                  ["Asana", "asana"],
                  ["Shopify", "shopify"],
                  ["ClickUp", "clickup"],
                  ["Zendesk", "zendesk"],
                  ["Intercom", "intercom"],
                  ["Mailchimp", "mailchimp"],
                ] as const).map(([name, slug, invert = false]) => (
                  <SimpleTooltip key={name} content={name} side="top">
                    <div
                      className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-card/40 backdrop-blur-xs transition-all duration-200 hover:scale-110 hover:bg-card/75 p-1"
                    >
                      <Image
                        src={`https://logos.composio.dev/api/${slug}`}
                        alt={name}
                        width={36}
                        height={36}
                        className={`h-8 w-8 sm:h-9 sm:w-9 object-contain rounded-xs ${invert ? "dark:invert" : ""}`}
                        unoptimized
                      />
                    </div>
                  </SimpleTooltip>
                ))}
              </motion.div>

              <motion.p variants={fadeInUp} className="text-muted-foreground text-xs sm:text-sm text-center max-w-xl mx-auto mb-10 leading-relaxed">
                Connect to 100+ tools and platforms instantly. Powered by Composio connectors, this single unified endpoint provides access to all your favorite apps with secure sandbox execution.
              </motion.p>

              <motion.div variants={fadeInUp} className="flex flex-col items-center gap-4 pt-2">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80 font-medium">
                  Works with your favorite IDE & Agent
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-3.5">
                  {[
                    { name: "VS Code", icon: "https://api.iconify.design/logos:visual-studio-code.svg", invert: false, href: "vscode:mcp/install?%7B%22name%22%3A%22mcp-assistant%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.mcp-assistant.in%2Fmcp%22%7D" },
                    { name: "Cursor", icon: "https://api.iconify.design/simple-icons:cursor.svg", invert: true, href: "cursor://anysphere.cursor-deeplink/mcp/install?name=mcp-assistant&config=eyJ0eXBlIjoic3NlIiwidXJsIjoiaHR0cHM6Ly9hcGkubWNwLWFzc2lzdGFudC5pbi9tY3AifQ==" },
                    { name: "Claude Desktop", icon: "https://api.iconify.design/simple-icons:anthropic.svg", invert: true },
                    { name: "ChatGPT", icon: "https://api.iconify.design/simple-icons:openai.svg", invert: true },
                    { name: "Antigravity", icon: "https://api.iconify.design/material-symbols:antigravity.svg", invert: true },
                    { name: "OpenCode", icon: "https://api.iconify.design/simple-icons:opencode.svg", invert: false },
                    { name: "Cline", icon: "https://api.iconify.design/simple-icons:cline.svg", invert: false },
                  ].map((client) => {
                    const content = (
                      <SimpleTooltip content={client.href ? `Install in ${client.name}` : client.name} side="top">
                        <div
                          className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-card/40 transition-all duration-200 p-1 ${client.href ? "hover:scale-110 hover:bg-card/75 cursor-pointer" : ""}`}
                        >
                          <img
                            src={client.icon}
                            alt={client.name}
                            width={32}
                            height={32}
                            className={`h-7.5 w-7.5 sm:h-8.5 sm:w-8.5 object-contain rounded-xs ${client.invert ? "dark:invert" : ""}`}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </SimpleTooltip>
                    );

                    if (client.href) {
                      return (
                        <a key={client.name} href={client.href}>
                          {content}
                        </a>
                      );
                    }

                    return <div key={client.name}>{content}</div>;
                  })}
                </div>
                <Link
                  href="https://docs.mcp-assistant.in/mcp-server"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-medium text-xs sm:text-sm hover:underline transition-all mt-2"
                >
                  View setup guide
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>

            </motion.div>
          </div>
        </section>

        {/* Quick Start Section */}
        <section className="py-16 sm:py-20 relative overflow-hidden border-t border-border/40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="max-w-3xl mx-auto"
            >
              <div className="text-center mb-10 space-y-3">
                <motion.span variants={fadeInUp} className="inline-block text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                  Quick Start
                </motion.span>
                <motion.h2
                  variants={fadeInUp}
                  className="text-3xl sm:text-4xl md:text-[44px] font-normal sm:font-[450] tracking-[-0.03em] leading-[1.15] text-foreground text-center"
                >
                  Get started
                </motion.h2>
                <motion.p
                  variants={fadeInUp}
                  className="text-muted-foreground text-base sm:text-lg text-center max-w-2xl mx-auto leading-relaxed tracking-[-0.01em]"
                >
                  Install the SDK and build MCP-powered applications in minutes.
                </motion.p>
              </div>

              <motion.div variants={fadeInUp} className="max-w-lg mx-auto mb-6">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold shrink-0">1</span>
                  <span className="font-semibold text-foreground text-sm">Install the package</span>
                </div>
                <div className="rounded-xl border border-border/70 bg-[#1e1e1e] overflow-hidden shadow-2xs">
                  <div className="flex items-center justify-between px-4 sm:px-5 py-3">
                    <code className="font-mono text-xs sm:text-sm">
                      <span className="text-[#d4d4d4]">npm install @mcp-ts/client</span>
                    </code>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => { void copyInstallCommand(); }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
                            aria-label="Copy install command"
                          >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {copied ? "Copied" : "Copy"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={fadeInUp} className="max-w-lg mx-auto mb-8">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold shrink-0">2</span>
                  <span className="font-semibold text-foreground text-sm">Connect and explore</span>
                </div>
                <div className="rounded-xl border border-border/70 bg-[#1e1e1e] overflow-hidden shadow-2xs">
                  <pre className="px-4 sm:px-5 py-4 overflow-x-auto m-0 text-xs sm:text-sm leading-relaxed">
                    <code className="font-mono">
                      <span className="text-[#c586c0]">import </span>
                      <span className="text-[#d4d4d4]">{'{ '}</span>
                      <span className="text-[#dcdcaa]">useMcp</span>
                      <span className="text-[#d4d4d4]">{' } '}</span>
                      <span className="text-[#c586c0]">from </span>
                      <span className="text-[#ce9178]">"@mcp-ts/client/react"</span>
                      <br />
                      <br />
                      <span className="text-[#569cd6]">const </span>
                      <span className="text-[#d4d4d4]">{'{ connections, connect } = '}</span>
                      <span className="text-[#dcdcaa]">useMcp</span>
                      <span className="text-[#d4d4d4]">{'({'}</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'  '}</span>
                      <span className="text-[#9cdcfe]">url</span>
                      <span className="text-[#d4d4d4]">{': '}</span>
                      <span className="text-[#ce9178]">"https://mcp.grep.app"</span>
                      <span className="text-[#d4d4d4]">,</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'  '}</span>
                      <span className="text-[#9cdcfe]">userId</span>
                      <span className="text-[#d4d4d4]">{': '}</span>
                      <span className="text-[#ce9178]">"user-123"</span>
                      <span className="text-[#d4d4d4]">,</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'})'}</span>
                      <br />
                      <br />
                      <span className="text-[#569cd6]">await </span>
                      <span className="text-[#dcdcaa]">connect</span>
                      <span className="text-[#d4d4d4]">{'({'}</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'  '}</span>
                      <span className="text-[#9cdcfe]">serverId</span>
                      <span className="text-[#d4d4d4]">{': '}</span>
                      <span className="text-[#ce9178]">"my-server"</span>
                      <span className="text-[#d4d4d4]">,</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'  '}</span>
                      <span className="text-[#9cdcfe]">serverName</span>
                      <span className="text-[#d4d4d4]">{': '}</span>
                      <span className="text-[#ce9178]">"My MCP Server"</span>
                      <span className="text-[#d4d4d4]">,</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'  '}</span>
                      <span className="text-[#9cdcfe]">serverUrl</span>
                      <span className="text-[#d4d4d4]">{': '}</span>
                      <span className="text-[#ce9178]">"https://mcp.example.com"</span>
                      <span className="text-[#d4d4d4]">,</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'  '}</span>
                      <span className="text-[#9cdcfe]">callbackUrl</span>
                      <span className="text-[#d4d4d4]">{': '}</span>
                      <span className="text-[#dcdcaa]">window</span>
                      <span className="text-[#d4d4d4]">.location.origin + </span>
                      <span className="text-[#ce9178]">"/callback"</span>
                      <span className="text-[#d4d4d4]">,</span>
                      <br />
                      <span className="text-[#d4d4d4]">{'})'}</span>
                    </code>
                  </pre>
                </div>
              </motion.div>

              <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm">
                <Link
                  href="https://docs.mcp-assistant.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline transition-all"
                >
                  View the docs
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <span className="text-muted-foreground/60">·</span>
                <Link
                  href="https://docs.mcp-assistant.in/examples"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline transition-all"
                >
                  Examples
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 sm:py-20 relative overflow-hidden border-t border-border/40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="text-center max-w-2xl mx-auto mb-10 space-y-3"
            >
              <motion.span variants={fadeInUp} className="inline-block text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                Questions & Answers
              </motion.span>
              <motion.h2
                variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-[44px] font-normal sm:font-[450] tracking-[-0.03em] leading-[1.15] text-foreground text-center"
              >
                Frequently Asked Questions
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-muted-foreground text-base sm:text-lg leading-relaxed text-center tracking-[-0.01em]"
              >
                Common questions about MCP Assistant and Model Context Protocol.
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="max-w-3xl mx-auto"
            >
              <Accordion type="single" collapsible className="w-full divide-y divide-border/60 border-y border-border/60">
                {[
                  {
                    q: "Can I build MCP servers using mcp-ts?",
                    a: "No. mcp-ts is strictly a client and application-layer library designed to connect to, route, and interact with MCP servers. If you want to author and host your own MCP servers, you should use server frameworks such as the official Model Context Protocol TypeScript/Python SDKs or FastMCP."
                  },
                  {
                    q: "How does mcp-ts compare to services like Composio, Nango, Smithery, FastMCP, Mnufact, or Klavis Strata?",
                    a: "The idea of connecting AI models to tools is not new, and the ecosystem offers many great frameworks, hosted services, and integration platforms (such as Composio, Nango, Smithery, FastMCP, Mnufact, Klavis Strata, Cloudflare Agents, or Pipedream). Developers are free to choose whichever service or platform best fits their requirements. mcp-ts is simply a modular TypeScript client library built for quick prototyping, experimenting, and running in production inside your own infrastructure, offering direct support for connecting to both local (via gateway) and remote MCP servers without routing private data through third-party proprietary clouds or paying per-call proxy markups."
                  },
                  {
                    q: "Why use mcp-ts instead of just the official MCP SDK?",
                    a: "The official MCP SDK provides the core protocol primitives (like listTools and callTool). mcp-ts provides client-side application utilities around them: multi-user session management, automatic OAuth 2.1 authorization with token refresh, pluggable storage backends, reconnect handling, and framework adapters (AI SDK, LangChain, Mastra, AG-UI)."
                  },
                  {
                    q: "What can I do with the Developer CLI (@mcp-ts/cli)?",
                    a: "The CLI provides standalone commands to inspect and automate any MCP server directly from your terminal: 'npx @mcp-ts/cli connect <url>' opens an interactive REPL to search tools, view schemas, and run tool calls; 'bench' measures endpoint latency and tool execution speed; 'codegen' generates typed TypeScript client functions; and 'gateway' bridges local stdio/SSE servers."
                  },
                  {
                    q: "How does the CLI local gateway work?",
                    a: "By running 'npx @mcp-ts/cli gateway', a lightweight local daemon bridges your machine's local stdio and SSE MCP servers to the browser client over a secure local WebSocket connection—making local developer tools accessible without modifying your server code or exposing private endpoints."
                  },
                  {
                    q: "Which AI frameworks and agent libraries are supported?",
                    a: "mcp-ts provides adapters for Vercel AI SDK (ai), LangChain (@langchain/core), Mastra (@mastra/core), and AG-UI protocol, allowing you to convert MCP servers into native framework tools with a single helper function."
                  },
                  {
                    q: "Can I connect both local and remote MCP servers?",
                    a: "Yes. Remote servers connect directly over HTTPS and Streamable HTTP/SSE. Local MCP servers (running via stdio or local SSE) can be bridged securely to the browser via the CLI gateway daemon (npx @mcp-ts/cli gateway)."
                  }
                ].map((faq, i) => (
                  <AccordionItem
                    key={i}
                    value={`item-${i}`}
                    className="border-none bg-transparent"
                  >
                    <AccordionTrigger className="text-[15px] sm:text-base font-semibold text-foreground hover:text-primary transition-colors py-4.5 sm:py-5 px-2 text-left hover:no-underline [&[data-state=open]]:text-primary">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pb-5 px-2 font-normal">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <div className="mt-8 text-center">
                <Link
                  href="/faq"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-primary hover:underline transition-all"
                >
                  View full FAQ documentation
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}

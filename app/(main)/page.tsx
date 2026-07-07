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
} from "lucide-react";
import Footer from "@/components/home/Footer";
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
      ease: [0.25, 0.46, 0.45, 0.94] as const // Smooth easing
    },
  },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }
};

function ServiceBadge({ name, icon, init, bg, invert, className }: { name: string; icon: string; init: string; bg: string; invert?: boolean; className?: string }) {
  const [errored, setErrored] = useState(false);
  const handleError = useCallback(() => setErrored(true), []);

  return (
    <div className={`flex flex-col items-center gap-1.5 group ${className ?? ""}`}>
      <div className={`flex h-14 w-14 items-center justify-center rounded-xl border border-border/60 transition-all duration-200 group-hover:border-red-200/60 group-hover:scale-110 dark:group-hover:border-red-400/30 ${errored ? bg : "bg-card/40"}`}>
        {errored ? (
          <span className="text-sm font-bold tracking-tight text-white">{init}</span>
        ) : (
          <Image
            src={`https://logos.composio.dev/api/${icon}`}
            alt={name}
            width={28}
            height={28}
            className={`h-7 w-7 ${invert ? "dark:invert" : ""}`}
            onError={handleError}
            unoptimized
          />
        )}
      </div>
      <span className="text-[10px] text-muted-foreground leading-tight text-center">{name}</span>
    </div>
  );
}

export default function Home() {
  const [copied, setCopied] = useState(false);

  const copyInstallCommand = async () => {
    const command = "npm install @mcp-ts/sdk";
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = command;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="relative max-w-5xl mx-auto min-h-0">
        {/* Hero Section */}
        <Stack
          dir="column"
          justify="center"
          items="center"
          className="min-h-[calc(100vh-4rem)] sm:h-[93vh] overflow-visible relative"
        >
          <HeroGridPattern />

          <Stack gap={3} className="z-50 w-full pointer-events-none">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={container}
              className="relative w-full flex flex-col items-center justify-center px-3 sm:px-6"
            >
              <div className="relative z-10 w-full max-w-6xl mx-auto text-center px-4 sm:px-6 lg:px-8">
                <motion.h1
                  variants={item}
                  className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] mb-5"
                >
                  Every resource is
                  <br className="hidden sm:block" />
                  {" "}
                  <span className="text-red-600">context</span>
                  {" "}
                  for your AI
                </motion.h1>

                <motion.p
                  variants={item}
                  className="mx-auto max-w-3xl text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed mb-8"
                >
                  Connect remote MCP servers, set granular tool-execution policies for your AI, and give agents access to tools, prompts, and resources—all from one place              </motion.p>

                <motion.div
                  variants={item}
                  className="grid w-full max-w-[280px] grid-cols-2 gap-3 mb-7 pointer-events-auto mx-auto"
                >
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Link
                      href="/mcp"
                      className="inline-flex w-full items-center justify-center px-3 py-2.5 rounded-lg text-base font-medium bg-red-600 text-white hover:bg-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500 transition border border-transparent shadow-xs"
                    >
                      Explore
                    </Link>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Link
                      href="/chat"
                      className="inline-flex w-full items-center justify-center px-3 py-2.5 rounded-lg text-base font-medium border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition"
                    >
                      Playground
                    </Link>
                  </motion.div>
                </motion.div>

                <motion.div
                  variants={item}
                  className="mt-8 flex flex-col items-center gap-3 w-full"
                >
                  <p className="text-xs text-muted-foreground tracking-wider uppercase font-medium text-center">
                    Connect your AI to 100+ platforms instantly
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl mx-auto">
                    {[
                      { name: "GitHub", icon: "https://logos.composio.dev/api/github" },
                      { name: "Gmail", icon: "https://logos.composio.dev/api/gmail" },
                      { name: "Google Docs", icon: "https://logos.composio.dev/api/googledocs" },
                      { name: "x", icon: "https://logos.composio.dev/api/twitter" },
                      { name: "Notion", icon: "https://logos.composio.dev/api/notion" },
                      { name: "Netlify", icon: "https://logos.composio.dev/api/netlify" },
                      { name: "Heroku", icon: "https://logos.composio.dev/api/heroku" },
                      { name: "cloudinary", icon: "https://logos.composio.dev/api/cloudinary" },
                      { name: "Higgsfield", icon: "https://logos.composio.dev/api/higgsfield" },
                      { name: "Perplexity", icon: "https://logos.composio.dev/api/perplexityai" },
                      { name: "Calendly", icon: "https://logos.composio.dev/api/calendly" },
                      { name: "Mem0", icon: "https://logos.composio.dev/api/mem0" },
                      { name: "Context 7", icon: "https://logos.composio.dev/api/context7" },
                      { name: "Firecrawl", icon: "https://logos.composio.dev/api/firecrawl" },
                      { name: "Parallel Search", icon: "https://logos.composio.dev/api/parallel", invert: true },
                      { name: "Exa", icon: "https://logos.composio.dev/api/exa", },
                    ].map((plat) => (
                      <div
                        key={plat.name}
                        className="flex h-11 w-11 items-center justify-center rounded-lg bg-card/40 backdrop-blur-xs transition-all duration-200 hover:scale-110"
                        title={plat.name}
                      >
                        <Image
                          src={plat.icon}
                          alt={plat.name}
                          width={30}
                          height={20}
                          className={`rounded-sm ${plat.invert ? "dark:invert" : ""}`}
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>

              </div>
            </motion.div>
          </Stack>
        </Stack>

        {/* About Section */}
        <section className="py-16 sm:py-18 relative overflow-hidden">
          <div className="max-w-5xl mx-auto px-3 sm:px-6 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="text-center max-w-4xl mx-auto mb-14 space-y-5"
            >
              <motion.h2
                variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground"
              >
                A toolkit for building with MCP
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed"
              >
                The{" "}
                <Link href="https://modelcontextprotocol.io/docs/getting-started/intro" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
                  Model Context Protocol
                </Link>{" "}
                makes it possible for AI apps to use tools and data, but building on top of it is more than tool invocation. You need sessions, OAuth flows, storage, reconnects, and framework integrations.{" "}
                <span className="font-medium text-foreground">mcp-ts</span> takes care of that application layer so you can focus on what your app does.
              </motion.p>

              <motion.div
                variants={fadeInUp}
                className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-4 max-w-2xl mx-auto text-left"
              >
                {[
                  { title: "Multi-user sessions", desc: "Persist and restore MCP connections per user across restarts with pluggable storage backends." },
                  { title: "OAuth 2.1 handling", desc: "Full authorization flow — redirect, token exchange, and automatic refresh out of the box." },
                  { title: "Framework adapters", desc: "Built-in adapters for AI SDK, LangChain, Mastra, and AG-UI Protocol." },
                  { title: "ToolRouter", desc: "On-demand tool discovery across servers. Loads only what each request needs, reducing context bloat." },
                  { title: "No vendor lock-in", desc: "Your MCP data stays in infrastructure you control — Redis, SQLite, Neon, Supabase, or memory." },
                  { title: "CodeMode sandbox", desc: "Run programmatic tool calls inside a secure sandbox, avoiding expensive LLM tool-calling loops." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <div className="shrink-0 mt-1.5 h-2 w-2 rounded-full bg-red-400" />
                    <div>
                      <p className="font-medium text-foreground text-sm">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Packages Section */}
        <section className="pb-16 sm:pb-18 relative">
          <div className="max-w-5xl mx-auto px-3 sm:px-6 relative">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={container}
                className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {[
                  {
                    icon: <Layers className="h-5 w-5" />,
                    title: "@mcp-ts/sdk",
                    desc: "Core SDK with multi-backend session storage, OAuth 2.1 handling, SSE support, React and Vue hooks, and adapters for AI SDK, LangChain, and Mastra.",
                    href: "https://github.com/zonlabs/mcp-ts/tree/main/packages/sdk"
                  },
                  {
                    icon: <Search className="h-5 w-5" />,
                    title: "@mcp-ts/tool-router",
                    desc: "On-demand tool discovery across multiple MCP servers. Reduces context bloat by loading only the tools needed for each request.",
                    href: "https://github.com/zonlabs/mcp-ts/tree/main/packages/tool-router"
                  },
                  {
                    icon: <Terminal className="h-5 w-5" />,
                    title: "@mcp-ts/codemode",
                    desc: "Sandboxed program execution for tool calling. Runs results inside a secure environment, avoiding expensive LLM tool-calling loops.",
                    href: "https://github.com/zonlabs/mcp-ts/tree/main/packages/code-mode"
                  }
                ].map((pkg, i) => (
                  <motion.div
                    key={i}
                    variants={item}
                    whileHover={{ y: -5 }}
                    className="group flex flex-col gap-4 rounded-2xl border border-red-200/75 bg-card/30 p-8 transition-all duration-300 hover:border-red-400/70 hover:bg-card/60 dark:border-red-400/25 dark:hover:border-red-300/60"
                  >
                    <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 transition-transform duration-300 group-hover:scale-110 dark:bg-red-950/40 dark:text-red-300">
                      {pkg.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-xl text-foreground/90 group-hover:text-primary transition-colors">
                        <a href={pkg.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {pkg.title}
                        </a>
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">
                        {pkg.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Remote MCP Server Section */}
        <section className="py-16 sm:py-18 relative">
          <div className="max-w-5xl mx-auto px-3 sm:px-6 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="max-w-4xl mx-auto"
            >
              <motion.h2
                variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground text-center mb-4"
              >
                Remote MCP Server
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-muted-foreground text-base sm:text-lg text-center max-w-3xl mx-auto leading-relaxed mb-10"
              >
                A hosted Streamable HTTP endpoint providing instant access to 100+ app connectors, tool discovery, and CodeMode.
              </motion.p>
 
              <motion.div
                variants={fadeInUp}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 pl-3.5 pr-2 py-1.5 text-sm mb-10 max-w-fit mx-auto"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none">Endpoint</span>
                <div className="h-3.5 w-px bg-border/80" />
                <code className="font-mono text-sm text-foreground inline-flex items-center gap-2">
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
                ] as const).map(([name, slug, invert]) => (
                  <div
                    key={name}
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-card/40 backdrop-blur-xs transition-all duration-200 hover:scale-110"
                    title={name}
                  >
                    <Image
                      src={`https://logos.composio.dev/api/${slug}`}
                      alt={name}
                      width={30}
                      height={20}
                      className={`rounded-sm ${invert ? "dark:invert" : ""}`}
                      unoptimized
                    />
                  </div>
                ))}
              </motion.div>
 
              <motion.p variants={fadeInUp} className="text-muted-foreground text-sm text-center max-w-2xl mx-auto mb-8 leading-relaxed">
                Connect to 100+ tools and platforms instantly. Powered by Composio connectors, this single unified endpoint provides access to all your favorite apps with secure sandbox execution and discovery.
              </motion.p>

              <motion.div variants={fadeInUp} className="flex flex-col items-center gap-4">
                <p className="text-sm text-muted-foreground">Works with your favorite IDE</p>
                <div className="flex flex-wrap items-center justify-center gap-4">
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
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-background transition-all duration-200 ${client.href ? "hover:border-red-200/60 hover:scale-110 dark:hover:border-red-400/30 cursor-pointer" : ""}`}
                        title={client.href ? `Install in ${client.name}` : client.name}
                      >
                        <img
                          src={client.icon}
                          alt={client.name}
                          width={24}
                          height={24}
                          className={`rounded-sm ${client.invert ? "dark:invert" : ""}`}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>
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
                  className="inline-flex items-center gap-1.5 text-primary font-medium text-sm hover:underline transition-all"
                >
                  View setup guide
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>

            </motion.div>
          </div>
        </section>

        {/* Quick Start Section */}
        <section className="py-16 sm:py-18 relative overflow-hidden">
          <div className="max-w-5xl mx-auto px-3 sm:px-6 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="max-w-4xl mx-auto"
            >
              <motion.h2
                variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground text-center mb-4"
              >
                Get started
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-muted-foreground text-base sm:text-lg text-center max-w-3xl mx-auto leading-relaxed mb-10"
              >
                Install the SDK and build MCP-powered apps in minutes.
              </motion.p>

              <motion.div variants={fadeInUp} className="max-w-lg mx-auto mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-semibold dark:bg-red-950/40 dark:text-red-300 shrink-0">1</span>
                  <span className="font-semibold text-foreground text-sm">Install the package</span>
                </div>
                <div className="rounded-xl border border-border/60 bg-[#1e1e1e] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3">
                    <code className="font-mono text-sm">
                      <span className="text-[#d4d4d4]">npm install @mcp-ts/sdk</span>
                    </code>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => { void copyInstallCommand(); }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors"
                            aria-label="Copy install command"
                          >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-semibold dark:bg-red-950/40 dark:text-red-300 shrink-0">2</span>
                  <span className="font-semibold text-foreground text-sm">Connect and explore</span>
                </div>
                <div className="rounded-xl border border-border/60 bg-[#1e1e1e] overflow-hidden">
                  <pre className="px-5 py-4 overflow-x-auto m-0">
                    <code className="font-mono text-sm leading-relaxed">
                      <span className="text-[#c586c0]">import </span>
                      <span className="text-[#d4d4d4]">{'{ '}</span>
                      <span className="text-[#dcdcaa]">useMcp</span>
                      <span className="text-[#d4d4d4]">{' } '}</span>
                      <span className="text-[#c586c0]">from </span>
                      <span className="text-[#ce9178]">"@mcp-ts/sdk/client/react"</span>
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

              <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-4 text-sm">
                <Link
                  href="https://docs.mcp-assistant.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary font-medium hover:underline transition-all"
                >
                  View the docs
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link
                  href="https://docs.mcp-assistant.in/examples"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary font-medium hover:underline transition-all"
                >
                  Examples
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>


        {/* FAQ Section */}
        <section className="relative max-w-5xl mx-auto py-12 overflow-hidden">
          <div className="px-3 sm:px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={container}
              className="text-center mb-12"
            >
              <motion.h2 variants={fadeInUp} className="text-3xl sm:text-4xl font-bold mb-4">
                Frequently Asked Questions
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-muted-foreground text-lg">
                Common questions about MCP Assistant.
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Accordion type="single" collapsible className="w-full">
                {[
                  {
                    q: "What is MCP Assistant?",
                    a: "A web-based MCP client that lets you connect to remote MCP servers, browse available tools, and interact with them from your browser without installing anything."
                  },
                  {
                    q: "Do I need to install anything?",
                    a: "For remote MCP servers, no. MCP Assistant works entirely in your browser. For local server access, installation is needed for the local gateway."
                  },
                  {
                    q: "How does authentication work?",
                    a: "The app supports OAuth 2.1 for MCP servers and handles the full authorization flow — redirect, token exchange, and automatic refresh — so you don't have to manage credentials manually."
                  },
                  {
                    q: "Can I connect to both local and remote servers?",
                    a: "Yes. Remote servers connect directly over HTTPS/SSE. Local servers can be exposed via the gateway or tunnel, making them accessible from anywhere without changing your server setup."
                  },
                  {
                    q: "Is it free to use?",
                    a: "Yes. MCP Assistant is free to use."
                  },
                  {
                    q: "What can I do with it?",
                    a: "Connect to MCP servers, explore their tools, run tool calls, and use the Playground to experiment with connected server capabilities."
                  }
                ].map((faq, i) => (
                  <AccordionItem
                    key={i}
                    value={`item-${i}`}
                    className="rounded-none border-b border-border/50 bg-transparent px-0 shadow-none"
                  >
                    <AccordionTrigger className="text-base font-semibold hover:no-underline py-5 px-1">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-5 px-1">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <div className="mt-10 text-center">
                <Link
                  href="/faq"
                  className="inline-flex items-center gap-2 text-primary font-medium hover:underline transition-all"
                >
                  View all FAQs
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        < Footer />
      </div>
    </>
  );
}













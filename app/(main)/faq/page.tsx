"use client"

import * as React from "react"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { motion, AnimatePresence } from "framer-motion"
import {
    ChevronRight,
    Layers,
    Terminal,
    ShieldCheck,
    HelpCircle,
    ExternalLink,
    Code,
    Cpu,
    Server,
    Boxes
} from "lucide-react"
import { cn } from "@/lib/utils"

const CATEGORIES = [
    { id: "sdk", name: "Core Client SDK", icon: Layers, desc: "@mcp-ts/client, sessions, protocol support" },
    { id: "cli", name: "Developer CLI & Gateway", icon: Terminal, desc: "@mcp-ts/cli, REPL, benchmark, codegen, gateway" },
    { id: "auth-storage", name: "Auth & Storage Backends", icon: ShieldCheck, desc: "OAuth 2.1, PKCE, Redis, SQLite, Supabase" },
    { id: "adapters", name: "AI Adapters & MCP Apps", icon: Boxes, desc: "Vercel AI SDK, LangChain, Mastra, MCP Apps" },
]

const faqs = [
    // -------------------------------------------------------------
    // Category: Core Client SDK (@mcp-ts/client)
    // -------------------------------------------------------------
    {
        category: "sdk",
        question: "Can I build MCP servers using mcp-ts?",
        answer: (
            <p>
                <strong>No.</strong> <code>mcp-ts</code> is strictly a client and application-layer library designed to connect to, route, and interact with MCP servers. If you are looking to author and host your own MCP servers, you should use dedicated server frameworks such as the official Model Context Protocol TypeScript/Python SDKs or <strong>FastMCP</strong>.
            </p>
        ),
    },
    {
        category: "sdk",
        question: "How does mcp-ts compare to services like Composio, Nango, Smithery, FastMCP, Mnufact, or Klavis Strata?",
        answer: (
            <div className="space-y-3">
                <p>
                    The idea of connecting AI models to external tools and APIs is not new. The ecosystem offers many great frameworks, hosted services, and integration platforms (such as <strong>Composio</strong>, <strong>Nango</strong>, <strong>Smithery</strong>, <strong>FastMCP</strong>, <strong>Mnufact</strong>, <strong>Klavis Strata</strong>, <strong>Cloudflare Agents</strong>, or <strong>Pipedream</strong>)—and developers are completely free to choose whichever architecture or platform best fits their project.
                </p>
                <p>
                    <code>mcp-ts</code> is simply a modular client library built for quick prototyping, experimenting, and running in production inside your own infrastructure, offering direct support for connecting to both local (via gateway) and remote MCP servers without routing private data through third-party proprietary clouds or paying per-call proxy markups.
                </p>
            </div>
        ),
    },
    {
        category: "sdk",
        question: "Why use mcp-ts instead of just the official MCP SDK?",
        answer: (
            <div className="space-y-3">
                <p>
                    The official MCP TypeScript SDK provides raw low-level protocol primitives (like <code>listTools</code> and <code>callTool</code>). However, building production AI applications on top of MCP often requires additional application-level wiring:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
                    <li><strong>Multi-user sessions:</strong> Persist and restore MCP connections per user across restarts.</li>
                    <li><strong>OAuth 2.1 lifecycle:</strong> Handles PKCE redirects, token storage, and automatic background refresh.</li>
                    <li><strong>Pluggable storage:</strong> Redis, SQLite, Postgres/Supabase, or In-Memory backends with standard interfaces.</li>
                    <li><strong>Built-in AI Adapters:</strong> One-line helper functions for Vercel AI SDK, LangChain, Mastra, and AG-UI.</li>
                    <li><strong>Reconnection & State Management:</strong> Automatic reconnects, SSE event streaming, and reactive React/Vue hooks.</li>
                </ul>
            </div>
        ),
    },
    {
        category: "sdk",
        question: "How does mcp-ts handle multi-user applications?",
        answer: (
            <p>
                In a multi-user application, each user has their own connected servers, OAuth tokens, and connection state. <strong>mcp-ts</strong> isolates connections by <code>userId</code> and persists connection metadata in your chosen storage backend. When a user returns or a serverless function restarts, their active connections and credentials are transparently restored.
            </p>
        ),
    },
    {
        category: "sdk",
        question: "Can mcp-ts run in serverless and edge environments?",
        answer: (
            <p>
                Yes. <strong>@mcp-ts/client</strong> is designed to work in serverless environments (such as Vercel Serverless Functions, AWS Lambda, Cloudflare Workers, and Node.js runtimes). When paired with a distributed storage backend like Redis, connection state persists across stateless function invocations.
            </p>
        ),
    },
    {
        category: "sdk",
        question: "How do React and Vue developers integrate with mcp-ts?",
        answer: (
            <div className="space-y-2">
                <p>
                    The SDK provides native hooks and composables for reactive frontend state:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li><code>useMcp</code> in React (<code>@mcp-ts/client/react</code>) provides reactive <code>connections</code>, <code>connect</code>, <code>disconnect</code>, and connection status.</li>
                    <li><code>useMcp</code> in Vue (<code>@mcp-ts/client/vue</code>) provides reactive composable state.</li>
                </ul>
            </div>
        ),
    },

    // -------------------------------------------------------------
    // Category: Developer CLI & Gateway (@mcp-ts/cli)
    // -------------------------------------------------------------
    {
        category: "cli",
        question: "What can I do with the Developer CLI (@mcp-ts/cli)?",
        answer: (
            <div className="space-y-3">
                <p>
                    The CLI (<code>@mcp-ts/cli</code>) allows developers to inspect, benchmark, and interact with any Streamable HTTP or SSE MCP server directly from the terminal without writing code:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
                    <li><code>npx @mcp-ts/cli connect &lt;url&gt;</code>: Opens an interactive REPL where you can search tools, inspect JSON schemas, and execute test tool calls.</li>
                    <li><code>npx @mcp-ts/cli search &lt;url&gt; "&lt;query&gt;"</code>: Searches available tools on an endpoint by natural language query.</li>
                    <li><code>npx @mcp-ts/cli bench &lt;url&gt;</code>: Runs performance benchmarks to measure server response latency and tool execution speed.</li>
                    <li><code>npx @mcp-ts/cli codegen &lt;url&gt; --out ./tools.ts</code>: Generates strongly-typed TypeScript client wrapper functions from the server's tool definitions.</li>
                    <li><code>npx @mcp-ts/cli gateway</code>: Starts the local gateway daemon for bridging local stdio and SSE tools.</li>
                </ul>
            </div>
        ),
    },
    {
        category: "cli",
        question: "How does the local CLI gateway connect local MCP servers to the web app?",
        answer: (
            <p>
                By running <code>npx @mcp-ts/cli gateway</code> (or Python <code>mcpassistant-gateway</code>), a local daemon creates a secure WebSocket bridge on your machine. This exposes local stdio or SSE MCP tools to the web client safely without modifying your server code or exposing private ports to the public internet.
            </p>
        ),
    },
    {
        category: "cli",
        question: "How does the CLI codegen command work?",
        answer: (
            <p>
                The <code>codegen</code> command introspects any running MCP server's <code>listTools</code> schema and generates fully typed TypeScript functions with parameter types and return type definitions. This makes calling remote tools feel like calling local, type-safe functions in your application.
            </p>
        ),
    },

    // -------------------------------------------------------------
    // Category: Authentication & Storage Backends
    // -------------------------------------------------------------
    {
        category: "auth-storage",
        question: "How does OAuth 2.1 authentication work for remote MCP servers?",
        answer: (
            <p>
                <strong>mcp-ts</strong> provides full authorization handling for MCP servers requiring authentication. It initiates the OAuth 2.1 authorization code flow with PKCE, manages browser redirects, completes token exchanges, persists credentials securely in your storage backend, and handles background refresh before tokens expire.
            </p>
        ),
    },
    {
        category: "auth-storage",
        question: "Which storage backends are supported?",
        answer: (
            <div className="space-y-2">
                <p>You can choose the storage backend that best fits your infrastructure:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li><strong>Redis:</strong> Recommended for serverless, edge, and distributed production deployments.</li>
                    <li><strong>SQLite / File System:</strong> Ideal for local development and self-hosted environments.</li>
                    <li><strong>Supabase / PostgreSQL:</strong> Great for cloud-native apps with relational databases.</li>
                    <li><strong>In-Memory:</strong> Useful for ephemeral testing and development.</li>
                </ul>
            </div>
        ),
    },

    // -------------------------------------------------------------
    // Category: AI Framework Adapters & MCP Apps
    // -------------------------------------------------------------
    {
        category: "adapters",
        question: "Which AI frameworks and agent libraries are supported?",
        answer: (
            <div className="space-y-3">
                <p>
                    <strong>mcp-ts</strong> provides first-class adapters to seamlessly convert MCP tools into native framework tool definitions:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
                    <li><strong>Vercel AI SDK:</strong> Easily pass tools into <code>generateText</code> or <code>streamText</code> using <code>toAiSdkTools()</code>.</li>
                    <li><strong>LangChain:</strong> Convert tools into LangChain <code>DynamicStructuredTool</code> instances.</li>
                    <li><strong>Mastra:</strong> Use tools directly within Mastra workflows and agents.</li>
                    <li><strong>AG-UI:</strong> Stream tool state and agent events using AG-UI protocol middleware.</li>
                </ul>
            </div>
        ),
    },
    {
        category: "adapters",
        question: "What are MCP Apps (SEP-1865)?",
        answer: (
            <p>
                <strong>MCP Apps</strong> is an open extension (SEP-1865) that enables MCP servers to deliver interactive HTML/React user interfaces directly inside AI clients. Instead of just returning plain text or JSON, servers can return rich UI components (dashboards, charts, approval modals, map views) that render securely inside sandboxed iframes.
            </p>
        ),
    },
]

export default function FAQPage() {
    const [activeCategory, setActiveCategory] = React.useState<string | null>(null)

    const filteredFaqs = React.useMemo(() => {
        if (!activeCategory) return faqs
        return faqs.filter(f => f.category === activeCategory)
    }, [activeCategory])

    return (
        <div className="flex min-h-[calc(100vh-56px)] bg-background font-sans">
            {/* Sidebar */}
            <aside className="w-68 border-r border-border/50 hidden md:block p-6 shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80 font-semibold mb-3">
                            Overview
                        </h3>
                        <button
                            onClick={() => setActiveCategory(null)}
                            className={cn(
                                "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer",
                                !activeCategory ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <HelpCircle className="h-4 w-4 shrink-0" />
                            All Questions ({faqs.length})
                        </button>
                    </div>

                    <div className="space-y-1">
                        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80 font-semibold mb-3">
                            Categories
                        </h3>
                        {CATEGORIES.map((cat) => {
                            const count = faqs.filter(f => f.category === cat.id).length
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(cat.id)}
                                    className={cn(
                                        "flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all group cursor-pointer text-left",
                                        activeCategory === cat.id ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <cat.icon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{cat.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground/60 shrink-0">{count}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="pt-4 border-t border-border/50 space-y-2">
                        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80 font-semibold mb-2">
                            Resources
                        </h3>
                        <a
                            href="https://github.com/zonlabs/mcp-ts"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1"
                        >
                            <Code className="h-3.5 w-3.5 shrink-0" />
                            mcp-ts Repository
                            <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                        </a>
                        <a
                            href="https://docs.mcp-assistant.in"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1"
                        >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            Full Documentation
                            <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                        </a>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 p-6 sm:p-10 md:p-12 overflow-y-auto">
                <div className="max-w-3xl">
                    {/* Header */}
                    <div className="mb-10 space-y-2">
                        <span className="inline-block text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                            Documentation & Help
                        </span>
                        <h1 className="text-3xl sm:text-4xl md:text-[44px] font-normal sm:font-[450] tracking-[-0.03em] leading-[1.12] text-foreground">
                            {activeCategory ? CATEGORIES.find(c => c.id === activeCategory)?.name : "Frequently Asked Questions"}
                        </h1>
                        <p className="text-sm sm:text-base text-foreground/80 leading-relaxed tracking-[-0.01em]">
                            Everything you need to know about mcp-ts, the Developer CLI, local gateways, and building MCP-native applications.
                        </p>
                    </div>

                    {/* Category Cards Overview */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeCategory || "all"}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {activeCategory === null && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-10">
                                    {CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setActiveCategory(cat.id)}
                                            className="group flex flex-col items-start p-4 sm:p-5 rounded-xl border border-border/60 bg-card hover:bg-muted/30 hover:border-primary/40 transition-all text-left shadow-2xs cursor-pointer"
                                        >
                                            <div className="p-2 rounded-lg bg-primary/10 text-primary mb-3 group-hover:scale-105 transition-transform">
                                                <cat.icon className="h-4.5 w-4.5" />
                                            </div>
                                            <h3 className="text-sm sm:text-base font-medium text-foreground mb-1 group-hover:text-primary transition-colors">{cat.name}</h3>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                {cat.desc} <ChevronRight className="h-3 w-3 ml-auto opacity-60 group-hover:translate-x-0.5 transition-transform" />
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* FAQ Accordion Groups */}
                            <div className="space-y-10">
                                {activeCategory ? (
                                    <div className="divide-y divide-border/60 border-y border-border/60">
                                        {filteredFaqs.map((faq, idx) => (
                                            <FaqItem key={idx} faq={faq} />
                                        ))}
                                    </div>
                                ) : (
                                    CATEGORIES.map(cat => {
                                        const catFaqs = filteredFaqs.filter(f => f.category === cat.id)
                                        if (catFaqs.length === 0) return null
                                        return (
                                            <div key={cat.id} className="space-y-3">
                                                <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                                                    <cat.icon className="h-4 w-4 text-primary shrink-0" />
                                                    <h2 className="text-base font-medium text-foreground">
                                                        {cat.name}
                                                    </h2>
                                                </div>
                                                <div className="divide-y divide-border/50">
                                                    {catFaqs.map((faq, idx) => (
                                                        <FaqItem key={idx} faq={faq} />
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    )
}

function FaqItem({ faq }: { faq: any }) {
    return (
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-none bg-transparent">
                <AccordionTrigger className="text-left text-[15px] sm:text-base font-semibold text-foreground hover:no-underline hover:text-primary transition-colors py-4 px-1 gap-3 [&[data-state=open]]:text-primary">
                    {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-xs sm:text-sm text-foreground/80 dark:text-foreground/75 leading-relaxed pb-5 px-1 font-normal">
                    {faq.answer}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    )
}

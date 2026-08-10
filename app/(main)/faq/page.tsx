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
    BookOpen,
    Settings,
    ShieldCheck,
    HelpCircle,
    ExternalLink
} from "lucide-react"
import { cn } from "@/lib/utils"

const CATEGORIES = [
    { id: "getting-started", name: "Getting started", icon: BookOpen },
    { id: "features", name: "Usage & Features", icon: Settings },
    { id: "security", name: "Security & Support", icon: ShieldCheck },
]

const faqs = [
    {
        category: "getting-started",
        question: "What is MCP Assistant?",
        answer: (
            <p>
                <strong>MCP Assistant</strong> is a <strong>web-based Model Context Protocol (MCP) client</strong> that lets you connect to and interact with <strong>remote MCP-compatible servers</strong> directly through your browser. It offers a lightweight, accessible, and developer-friendly way to test MCP servers without installing anything locally.
            </p>
        ),
    },
    {
        category: "getting-started",
        question: "What does “MCP” stand for?",
        answer: (
            <p>
                <strong>MCP</strong> stands for <strong>Model Context Protocol</strong>, an <strong>open standard</strong> that enables AI assistants and applications to communicate effectively with external tools, data sources, and services. It standardizes how AI systems request information and perform actions through remote servers.
            </p>
        ),
    },
    {
        category: "getting-started",
        question: "Do I need to install anything?",
        answer: (
            <p>
                For remote MCP servers, no installation is required - MCP Assistant works entirely in your browser. Installation is only needed for local access, when you want to expose MCP servers running on your own machine via Gateway.
            </p>
        ),
    },
    {
        category: "getting-started",
        question: "What is Model Context Protocol (MCP)?",
        answer: (
            <p>
                MCP is a communication standard that acts like a <strong>universal interface</strong> between AI models and tools, allowing AI to access real-time data and services safely and consistently Ã¢â‚¬â€ similar to how USB-C standardizes device connections.
            </p>
        ),
    },
    {
        category: "features",
        question: "What can I do with MCP Assistant?",
        answer: (
            <div className="space-y-2">
                <p>With MCP Assistant you can:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>🔗 <strong>Connect instantly</strong> to remote MCP servers via URL</li>
                    <li>🛠️ <strong>Interact with MCP servers</strong> to execute tool calls and retrieve contextual data</li>
                    <li>🧪 <strong>Explore and test MCP tools</strong> directly from your browser</li>
                    <li>💡 <strong>Use the AI Playground</strong> to experiment with agents connected to dynamic MCP toolsets</li>
                </ul>
            </div>
        ),
    },
    {
        category: "features",
        question: "How do I connect to an MCP server?",
        answer: (
            <p>
                You connect using the <strong>MCP server's URL</strong>. Once connected, MCP Assistant will establish communication with the server and make its tools available for interaction. Simply enter the server URL into the relevant connection field.
            </p>
        ),
    },
    {
        category: "features",
        question: "What is the Playground feature?",
        answer: (
            <div className="space-y-2">
                <p>The <strong>Playground</strong> is an interactive interface within MCP Assistant where you can:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Chat with AI agents that connect via MCP</li>
                    <li>Experiment with tools exposed by MCP servers</li>
                    <li>Test scenarios in real-time with dynamic tool bindings</li>
                </ul>
            </div>
        ),
    },
    {
        category: "features",
        question: "How do I publish or add my MCP server?",
        answer: (
            <p>
                You can add your MCP server from the MCP page in MCP Assistant.
                Once your server is published, it will appear in the list and can be discovered and connected to by others Ã¢â‚¬â€ as long as the MCP server is remote and publicly accessible.
            </p>
        ),
    },
    {
        category: "features",
        question: "What is the MCP Registry?",
        answer: (
            <p>
                The MCP Registry is the official Model Context Protocol registry that lists publicly available MCP servers.
                It acts as a central directory where MCP servers can be published, discovered, and accessed.
            </p>
        ),
    },
    {
        category: "features",
        question: "Can I interact with MCP servers from the registry?",
        answer: (
            <p>
                Yes. You can browse a variety of MCP servers available in the registry and directly connect to and interact with them using MCP Assistant.
            </p>
        ),
    },
    {
        category: "security",
        question: "Is using MCP Assistant secure?",
        answer: (
            <p>
                MCP Assistant connects securely to remote MCP servers over standard web protocols. However, <strong>security also depends on the MCP servers you connect to</strong> Ã¢â‚¬â€ ensure you trust the server and understand its privacy implications before connecting.
            </p>
        ),
    },
    {
        category: "security",
        question: "Who is MCP Assistant for?",
        answer: (
            <div className="space-y-2">
                <p>MCP Assistant is ideal for:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Developers</strong> testing and debugging MCP servers</li>
                    <li><strong>AI engineers</strong> exploring tool integrations</li>
                    <li><strong>Technology teams</strong> building agentic systems</li>
                    <li>Anyone who wants a <strong>host-free way to interact with MCP servers</strong></li>
                </ul>
            </div>
        ),
    },
    {
        category: "security",
        question: "What platforms does MCP Assistant support?",
        answer: (
            <p>
                Since MCP Assistant runs in your browser, it works on any <strong>modern device or operating system</strong> Ã¢â‚¬â€ including desktops, laptops, and most mobile browsers Ã¢â‚¬â€ with no special requirements.
            </p>
        ),
    },
    {
        category: "security",
        question: "Where can I find documentation or get help?",
        answer: (
            <div className="space-y-4">
                <div className="grid gap-2">
                    <a href="https://modelcontextprotocol.io" target="_blank" className="flex items-center gap-2 text-primary hover:underline">
                        <ExternalLink className="h-4 w-4" /> Ã°Å¸â€œËœ <strong>MCP Protocol Docs</strong>
                    </a>
                    <a href="https://github.com/zonlabs/mcp-ts" target="_blank" className="flex items-center gap-2 text-primary hover:underline">
                        <ExternalLink className="h-4 w-4" /> Ã°Å¸â€Â§ <strong>GitHub Repository</strong>
                    </a>
                </div>
                <p>Ã°Å¸â€œÂ© <strong>Contact Support:</strong> himanshu.mehta.sde@gmail.com</p>
            </div>
        ),
    },
    {
        category: "security",
        question: "Is MCP Assistant free to use?",
        answer: (
            <p>
                Yes. MCP Assistant is completely free and will always remain free, making it easy for developers and enthusiasts to explore and experiment with MCP servers without any cost.
            </p>
        ),
    },
]

export default function FAQPage() {
    const [activeCategory, setActiveCategory] = React.useState<string | null>(null)

    const filteredFaqs = faqs.filter(faq => {
        return activeCategory ? faq.category === activeCategory : true
    })

    return (
        <div className="flex min-h-[calc(100vh-64px)] bg-background">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border/50 hidden md:block p-6 shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
                <div className="space-y-8">
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                            Overview
                        </h3>
                        <button
                            onClick={() => setActiveCategory(null)}
                            className={cn(
                                "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                !activeCategory ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <HelpCircle className="h-4 w-4" />
                            All Questions
                        </button>
                    </div>

                    <div className="space-y-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-3">
                            Categories
                        </h3>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={cn(
                                    "flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                                    activeCategory === cat.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <cat.icon className="h-4 w-4" />
                                    {cat.name}
                                </div>
                                {/* <ChevronRight className={cn("h-3 w-3 transition-transform", activeCategory === cat.id && "rotate-90")} /> */}
                            </button>
                        ))}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 p-6 md:p-12 overflow-y-auto">
                <div className="max-w-3xl">
                    {/* Header */}
                    <div className="mb-12">
                        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
                            {activeCategory ? CATEGORIES.find(c => c.id === activeCategory)?.name : "Frequently Asked Questions"}
                        </h1>
                        <p className="text-lg text-muted-foreground">
                            Everything you need to know about MCP Assistant and building agentic systems.
                        </p>
                    </div>

                    {/* FAQ Sections */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeCategory || "all"}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            {activeCategory === null && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                                    {CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setActiveCategory(cat.id)}
                                            className="group flex flex-col items-start p-6 rounded-2xl border border-border/50 bg-card/50 hover:bg-primary/5 hover:border-primary/50 transition-all text-left shadow-sm hover:shadow-md"
                                        >
                                            <div className="p-3 rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
                                                <cat.icon className="h-6 w-6" />
                                            </div>
                                            <h3 className="text-lg font-bold mb-2">{cat.name}</h3>
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                Learn more about {cat.name.toLowerCase()} <ChevronRight className="h-3 w-3" />
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-12">
                                {activeCategory ? (
                                    <div className="space-y-4">
                                        {filteredFaqs.map((faq, idx) => (
                                            <FaqItem key={idx} faq={faq} />
                                        ))}
                                    </div>
                                ) : (
                                    CATEGORIES.map(cat => {
                                        const catFaqs = filteredFaqs.filter(f => f.category === cat.id)
                                        if (catFaqs.length === 0) return null
                                        return (
                                            <div key={cat.id} className="space-y-6">
                                                <h2 className="text-xl font-bold flex items-center gap-2 pb-2 border-b">
                                                    <cat.icon className="h-5 w-5 text-primary" />
                                                    {cat.name}
                                                </h2>
                                                <div className="space-y-4">
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
            <AccordionItem value="item-1" className="border-none">
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline hover:text-primary transition-colors py-2 gap-2">
                    {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-base leading-relaxed pt-2">
                    {faq.answer}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    )
}


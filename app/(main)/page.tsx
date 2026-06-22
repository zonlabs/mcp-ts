"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Wrench,
  Code,
  Package,
  Copy,
  Check,
  ArrowUpRight,
} from "lucide-react";
import Footer from "@/components/home/Footer";
import Image from "next/image";
import { motion, Variants } from 'framer-motion';
import { NeuralButton } from "@/components/ui/neural-button";
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
import {
  HeroGridPattern
} from "@/components/home/hero-grid-pattern";
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

function VideoPlayer() {
  return (
    <div className="w-full">
      <video
        controls
        width="100%"
        preload="metadata"
        autoPlay
        muted
        playsInline
      >
        <source
          src="https://d1nja2c4hm7c7d.cloudfront.net/media/demo.mcp-assistant.mp4"
          type="video/mp4"
        />
      </video>
    </div>
  );
}

export default function Home() {
  const [copied, setCopied] = useState(false);

  const copyInstallCommand = async () => {
    const command = "uvx mcpassistant-gateway";
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
            {/* ===== Hero Content ===== */}
            <div className="relative z-10 w-full max-w-6xl mx-auto text-center px-4 sm:px-6 lg:px-8">
              <motion.div variants={item} className="mb-5 flex flex-col items-center gap-2">
                <Image
                  src="/logo-mark-red.svg"
                  alt="MCP Assistant"
                  width={44}
                  height={44}
                />
                <p className="text-lg sm:text-xl font-bold tracking-tight text-foreground font-sans-original">
                  MCP Assistant
                </p>
              </motion.div>

              <motion.h2
                variants={item}
                className="text-3xl sm:text-4xl md:text-6xl tracking-tight leading-[1.05] mb-5"
              >
                Connect MCP servers
                <br className="hidden sm:block" />
                {" "}
                <span className="text-zinc-600">directly from your browser</span>
              </motion.h2>

              <motion.p
                variants={item}
                className="mx-auto max-w-3xl text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed mb-6"
              >
                MCP Assistant is a{' '}
                <Link
                  href="https://modelcontextprotocol.io/docs/learn/client-concepts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:text-primary transition-colors pointer-events-auto"
                >
                  <span>Model Context Protocol (MCP)</span>
                </Link>{' '}client that lets you test your server, interact with other MCP servers in one place, and more.
              </motion.p>

              <motion.div
                variants={item}
                className="mb-8 flex flex-wrap items-center justify-center gap-2.5"
              >
                {[
                  "Browser client",
                  "Local + Remote MCP",
                  "Developer tools",
                  "Free to use",
                ].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full border border-red-300/80 bg-gradient-to-b from-white/95 to-red-50/90 px-3.5 py-1.5 text-xs font-semibold text-red-700 backdrop-blur-md sm:text-sm dark:border-red-400/35 dark:from-zinc-950/90 dark:to-red-950/40 dark:text-red-100"
                  >
                    {label}
                  </span>
                ))}
              </motion.div>

              {/* ===== CTA Buttons ===== */}
              <motion.div
                variants={item}
                className="grid w-full max-w-md grid-cols-2 gap-3 mb-7 pointer-events-auto mx-auto"
              >
                {/* 🔥 Explore Button (Gradient Border) */}
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <NeuralButton
                    asChild
                    className="h-auto w-full rounded-lg border border-white/90 bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-900 dark:border-white/80 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                  >
                    <Link href="/mcp">
                      Explore
                    </Link>
                  </NeuralButton>
                </motion.div>

                {/* ✅ Chat Button */}
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Link
                    href="/chat"
                    className="
        inline-flex w-full items-center justify-center
        px-5 py-2.5 rounded-lg text-sm font-medium
        border border-red-200/80 bg-white text-red-700
        hover:bg-red-50
        dark:border-red-400/30 dark:bg-zinc-950 dark:text-red-100 dark:hover:bg-zinc-900
        transition
      "
                  >
                    Playground
                  </Link>
                </motion.div>
              </motion.div>

            </div>
          </motion.div>
        </Stack>
      </Stack>

      {/* Features Section */}
      <section className="py-16 sm:py-18 relative overflow-hidden bg-background">


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
              Everything you need to work with MCPs
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed"
            >
              The <Link href="https://modelcontextprotocol.io/docs/getting-started/intro" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">Model Context Protocol (MCP)</Link> is the open standard for connecting AI agents to external tools and data. Use MCP Assistant to connect to servers, explore tools, and work with MCPs in one place.
            </motion.p>
          </motion.div>

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
                  icon: <Wrench className="h-5 w-5" />,
                  title: "Connect to MCP servers",
                  desc: "Add your remote server to connect to it."
                },
                {
                  icon: <Code className="h-5 w-5" />,
                  title: "Playground",
                  desc: "Chat with the assistant and use tools exposed by connected servers."
                },
                {
                  icon: <Package className="h-5 w-5" />,
                  title: "Browse Featured MCPs",
                  desc: "Find featured servers quickly and open them in the MCP workspace."
                }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  variants={item}
                  whileHover={{ y: -5 }}
                  className="group flex flex-col gap-4 rounded-2xl border border-red-200/75 bg-card/30 p-8 transition-all duration-300 hover:border-red-400/70 hover:bg-card/60 dark:border-red-400/25 dark:hover:border-red-300/60"
                >
                  <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 transition-transform duration-300 group-hover:scale-110 dark:bg-red-950/40 dark:text-red-300">
                    {feature.icon}
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-xl text-foreground/90 group-hover:text-primary transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Gateway Section */}
      <section
        id="local-gateway-demo"
        className="relative max-w-5xl mx-auto px-3 sm:px-6 py-10"
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={container}
          className="rounded-3xl border border-red-200/75 bg-card/30 p-5 sm:p-7 dark:border-red-400/25"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-5">
              <motion.h2 variants={fadeInUp} className="text-2xl sm:text-3xl font-bold tracking-tight">
                MCP Assistant Gateway
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-muted-foreground leading-relaxed">
                Use Gateway to let client applications like ChatGPT, Claude, and any MCP-compatible client access your local MCP servers through a secure bridge.
              </motion.p>

              <motion.div variants={fadeInUp} className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Install Gateway</p>
                <div className="inline-flex max-w-full items-center rounded-xl border border-red-200/80 bg-muted/40 px-3 py-2.5 dark:border-red-400/30">
                  <code className="font-mono text-sm sm:text-base text-foreground">
                    uvx mcpassistant-gateway
                  </code>
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => { void copyInstallCommand(); }}
                          className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background/70 transition-colors"
                          aria-label="Copy install command"
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {copied ? "Copied" : "Copy"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </motion.div>

              <motion.div variants={fadeInUp} className="space-y-1 text-sm text-muted-foreground">
                <p>1. Start gateway on your machine.</p>
                <p>2. Login using CLI with <code>/login</code>.</p>
                <p>3. Authorize your client using the CLI session.</p>
                <p>4. Use generated URL to connect your client.</p>
              </motion.div>

              {/* <motion.div variants={fadeInUp}>
                <Link
                  href="/gateway"
                  className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
                >
                  Open Gateway
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </motion.div> */}
            </div>

            <motion.div variants={fadeInUp} className="rounded-2xl border border-red-200/75 bg-background/60 p-2 sm:p-3 dark:border-red-400/25">
              <VideoPlayer />
            </motion.div>
          </div>
        </motion.div>
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
              Find answers to the most common questions about MCP Assistant.
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
                  a: "MCP Assistant is a web-based Model Context Protocol (MCP) client that lets you connect to and interact with remote MCP-compatible servers directly through your browser. It offers a lightweight, accessible, and developer-friendly way to test MCP servers without installing anything locally."
                },
                {
                  q: "What does \"MCP\" stand for?",
                  a: "MCP stands for Model Context Protocol, an open standard that enables AI assistants and applications to communicate effectively with external tools, data sources, and services."
                },
                {
                  q: "Do I need to install anything?",
                  a: "For remote MCP servers, no installation is required - MCP Assistant works in your browser. Installation is only needed for local access, when you want to expose MCP servers running on your own machine via Gateway."
                },
                {
                  q: "Is using MCP Assistant free?",
                  a: "Yes. MCP Assistant is completely free and will always remain free, making it easy for developers and enthusiasts to explore and experiment with MCP servers without any cost."
                },
                {
                  q: "What can I do with MCP Assistant?",
                  a: "You can connect instantly to remote MCP servers via URL, interact with tools to execute calls and retrieve data, and use the AI Playground to experiment with dynamic toolsets."
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
  );
}













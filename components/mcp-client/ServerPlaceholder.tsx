"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Copy, Search, Server, Star, Hammer } from "lucide-react";
import { toast } from "react-hot-toast";
import { ServerIcon } from "@/components/common/ServerIcon";
import type { McpServer } from "@/types/mcp";

interface ServerPlaceholderProps {
  type: "no-selection" | "no-servers";
  tab?: "public" | "user";
  featuredServers?: McpServer[];
}

const MCP_ASSISTANT_URL = "https://api.mcp-assistant.in/mcp";
const MCP_CLIENT_ICONS = [
  {
    name: "VS Code",
    url: "https://code.visualstudio.com",
    fallbackImage: "https://api.iconify.design/logos:visual-studio-code.svg",
  },
  {
    name: "Cursor",
    url: "https://cursor.com",
    fallbackImage: "https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/light/cursor.png",
  },
  {
    name: "Notion",
    url: "https://www.notion.so",
    fallbackImage: "https://api.iconify.design/logos:notion-icon.svg",
  },
] as const;

export function ServerPlaceholder({
  type,
  tab,
  featuredServers = [],
}: ServerPlaceholderProps) {
  const [urlCopied, setUrlCopied] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  const formatDescription = (description?: string | null) => {
    if (!description) return null;

    return description
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleCopyAssistantUrl = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(MCP_ASSISTANT_URL);
      setUrlCopied(true);
      toast.success("Copied MCP endpoint");
      window.setTimeout(() => setUrlCopied(false), 1600);
    } catch {
      toast.error("Could not copy MCP endpoint");
    }
  };

  if (type === "no-selection") {
    return (
      <div className="flex-1 p-4 sm:p-6 md:p-8 min-h-[calc(100vh-120px)] dark:bg-transparent">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-5xl w-full"
        >
          <motion.div variants={itemVariants} className="mb-5">
            <div className="flex items-center gap-2">
              <Hammer className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Our Remote MCP</h2>
            </div>
            <Link
              href="/mcp?remote-mcp=activity"
              className="mt-1 block rounded-lg border border-red-200/70 bg-background px-4 py-4 transition-colors hover:bg-red-50/20 dark:border-red-400/20 dark:hover:bg-red-950/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                    <ServerIcon
                      serverName="MCP Assistant"
                      serverUrl={MCP_ASSISTANT_URL}
                      size={28}
                      className="rounded-md"
                    />
                  </div>
                  <p className="text-[1.35rem] font-semibold tracking-tight text-foreground">MCP Assistant</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                      {MCP_CLIENT_ICONS.map((client) => (
                        <div
                          key={client.name}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background"
                        >
                          <img
                            src={client.fallbackImage}
                            alt={`${client.name} icon`}
                            width={16}
                            height={16}
                            className="rounded-sm"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ))}
                    </div>
              </div>

              <div className="mt-4 rounded-sm bg-red-50/80 px-4 py-3 dark:bg-red-950/20">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500/80">
                  URL
                </div>
                <div className="flex items-center justify-between gap-3">
                  <code className="truncate text-sm text-red-700 dark:text-red-300">
                    {MCP_ASSISTANT_URL}
                  </code>
                  <button
                    type="button"
                    aria-label="Copy MCP endpoint"
                    onClick={handleCopyAssistantUrl}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    {urlCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground/80">
                  Open usage
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </motion.div>

          {featuredServers.length > 0 && (
            <motion.div variants={itemVariants} className="p-0">
              <div className="mb-5">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <h2 className="text-base font-semibold text-foreground">Popular MCPs</h2>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Featured servers available in MCP Assistant.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {featuredServers.map((server) => (
                  <div
                    key={server.id}
                    className="rounded-xl border border-red-200/70 bg-background/50 p-3 text-left transition-colors hover:bg-red-50/20 dark:border-red-400/20 dark:hover:bg-red-950/10"
                  >
                    <div className="flex items-start gap-2.5">
                      <ServerIcon
                        serverName={server.name}
                        serverUrl={server.url}
                        size={36}
                        className="rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{server.name}</p>
                        {formatDescription(server.description) ? (
                          <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
                            {formatDescription(server.description)}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            No description available.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  // No Servers - User Tab
  if (type === "no-servers" && tab === "user") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="bg-muted/50 p-4 rounded-full mb-4">
          <Server className="h-8 w-8 text-muted-foreground/70" />
        </div>
        <h3 className="text-base font-semibold mb-2">No Personal Servers</h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6 leading-relaxed">
          You haven't connected any custom servers yet. Add a local or remote server to get started.
        </p>
      </div>
    );
  }

  // No Servers - Public Tab (or generic)
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
      <div className="bg-muted/50 p-4 rounded-full mb-4">
        <Search className="h-8 w-8 text-muted-foreground/70" />
      </div>
      <h3 className="text-base font-semibold mb-2">No Public Servers Found</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
        We couldn't find any public servers matching your criteria. Try adjusting your filters.
      </p>
    </div>
  );
}

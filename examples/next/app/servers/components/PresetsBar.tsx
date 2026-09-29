"use client";

import * as React from "react";
import { Sparkles, Plus, Globe, Search, Code2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PresetServer } from "../types";

export const PRESETS: PresetServer[] = [
  {
    name: "Exa AI Search",
    url: "https://mcp.exa.ai/mcp?login",
    description: "Neural web search & AI-native scraping with OAuth 2.1",
    auth: { type: "oauth" },
    metadata: { category: "web-search", provider: "exa" },
  },
  {
    name: "Tavily Search",
    url: "https://mcp.tavily.com/mcp",
    description: "Real-time search and extraction tailored for LLM agents",
    auth: { type: "bearer", token: "tvly-test-token" },
    metadata: { category: "web-search", provider: "tavily" },
  },
  {
    name: "Context7 MCP",
    url: "https://mcp.context7.com/mcp",
    description: "Real-time documentation aggregator and context engine",
    auth: { type: "none" },
    metadata: { category: "documentation", provider: "context7" },
  },
  {
    name: "GitHub MCP",
    url: "https://mcp.github.com/mcp",
    description: "Manage repositories, pull requests, issues, and code search",
    auth: {
      type: "custom-headers",
      headers: { "X-GitHub-Token": "ghp_demo_token_123" },
    },
    metadata: { category: "developer-tools", provider: "github" },
  },
];

interface PresetsBarProps {
  onSelectPreset: (preset: PresetServer) => void;
  disabled?: boolean;
}

export function PresetsBar({ onSelectPreset, disabled }: PresetsBarProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-r from-card via-card/80 to-muted/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Start Presets
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            disabled={disabled}
            onClick={() => onSelectPreset(preset)}
            className="flex flex-col text-left p-3 rounded-lg border border-border/60 bg-card/70 hover:bg-muted/50 hover:border-primary/40 transition-all group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                {preset.name}
              </span>
              <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>

            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
              {preset.description}
            </p>

            <div className="mt-2.5 flex items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {preset.auth.type}
              </span>
              {preset.metadata?.category ? (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                  {String(preset.metadata.category)}
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

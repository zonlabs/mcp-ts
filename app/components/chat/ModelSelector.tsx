"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search, Info, Loader2 } from "lucide-react";
import { getProviderIconUrl, isProviderDarkInvert } from "@/components/chat/llmProviders";
import { cn } from "@/lib/utils";

export interface ModelSelectorModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  tag?: string;
  contextLength?: number;
}

interface ModelSelectorProps {
  selectedModel: string;
  onSelect: (id: string) => void;
}

export function ModelSelector({ selectedModel, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelSelectorModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadModels() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await fetch("/api/models");
        if (!res.ok) {
          throw new Error(`Failed to fetch models: ${res.statusText}`);
        }
        const data = await res.json();
        if (isMounted) {
          if (Array.isArray(data?.models) && data.models.length > 0) {
            setModels(data.models);
          } else {
            setModels([]);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setFetchError(err.message || "Failed to load models");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadModels();
    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      `${m.name} ${m.id} ${m.provider} ${m.description || ""}`.toLowerCase().includes(q)
    );
  }, [models, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelSelectorModel[]>();
    for (const model of filtered) {
      const key = model.provider || "OpenRouter";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(model);
    }

    // Sort items within OpenRouter so auto and free are first
    const orItems = map.get("OpenRouter");
    if (orItems) {
      orItems.sort((a, b) => {
        if (a.id === "openrouter/auto") return -1;
        if (b.id === "openrouter/auto") return 1;
        if (a.id === "openrouter/free") return -1;
        if (b.id === "openrouter/free") return 1;
        return a.name.localeCompare(b.name);
      });
    }

    const priority = [
      "OpenRouter",
      "OpenAI",
      "Anthropic",
      "Google",
      "DeepSeek",
      "Qwen",
      "Meta",
      "Mistral",
      "xAI",
      "Moonshot AI",
      "Z-AI",
      "Microsoft",
      "Cohere",
      "Perplexity",
    ];

    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = priority.indexOf(a);
      const ib = priority.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  const selected = models.find((m) => m.id === selectedModel);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-muted/60 text-xs text-muted-foreground hover:bg-muted/80 transition-colors max-w-[170px] sm:max-w-[220px] md:max-w-none min-w-0 border border-hairline"
      >
        {selected?.provider && getProviderIconUrl(selected.provider) ? (
          <img
            src={getProviderIconUrl(selected.provider)}
            alt=""
            className={cn(
              "h-3.5 w-3.5 shrink-0 object-contain",
              isProviderDarkInvert(selected.provider) && "dark:invert"
            )}
          />
        ) : null}
        <span className="text-foreground/90 truncate text-xs font-medium">
          {selected?.name || selectedModel || "Select model"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[580px] p-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="px-4 pt-4 pr-12 flex-row items-center justify-between space-y-0 pb-2 border-b border-hairline">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-sm font-semibold text-foreground">OpenRouter Models</DialogTitle>
              {models.length > 0 ? (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {models.length}
                </span>
              ) : null}
            </div>
            <DialogDescription className="sr-only">Search and select an AI model from OpenRouter</DialogDescription>
            <Link
              href="/settings/api-keys"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Info className="h-3.5 w-3.5" />
              <span>Configure API Key</span>
            </Link>
          </DialogHeader>
          
          <div className="px-4 pt-3 pb-2">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isLoading ? "Loading models from OpenRouter..." : "Search models by name, author, or id..."}
                disabled={isLoading && models.length === 0}
                className="h-9 pl-9 text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-minimal min-h-[250px]">
            {isLoading && models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Fetching live models from OpenRouter...</span>
              </div>
            ) : fetchError && models.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-destructive">
                {fetchError}
              </div>
            ) : grouped.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No models found matching &quot;{query}&quot;.
              </div>
            ) : (
              grouped.map(([provider, items]) => (
                <div key={provider} className="px-2 pb-3">
                  <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                    {getProviderIconUrl(provider) ? (
                      <img
                        src={getProviderIconUrl(provider)}
                        alt=""
                        className={cn(
                          "h-3 w-3 shrink-0 object-contain",
                          isProviderDarkInvert(provider) && "dark:invert"
                        )}
                      />
                    ) : null}
                    <span>{provider}</span>
                    <span className="text-[10px] text-muted-foreground/60 font-normal">({items.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {items.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelect(model.id);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left ${
                          selectedModel === model.id
                            ? "bg-primary/10 text-foreground font-medium"
                            : "hover:bg-muted/60 text-foreground"
                        }`}
                      >
                        <div className="h-6 w-6 flex items-center justify-center overflow-hidden rounded-full bg-background border border-hairline shrink-0">
                          {getProviderIconUrl(model.provider) ? (
                            <img
                              src={getProviderIconUrl(model.provider)}
                              alt=""
                              className={cn(
                                "h-3.5 w-3.5 object-contain",
                                isProviderDarkInvert(model.provider) && "dark:invert"
                              )}
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {model.provider.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs truncate">{model.name}</span>
                            {model.tag ? (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono">
                                {model.tag}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate font-mono">
                            {model.id}
                          </div>
                        </div>
                        {selectedModel === model.id ? (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search, Info } from "lucide-react";
import { getProviderIconUrl } from "@/components/playground/llmProviders";

export interface ModelSelectorModel {
  id: string;
  name: string;
  provider: string;
}

interface ModelSelectorProps {
  models: ModelSelectorModel[];
  selectedModel: string;
  onSelect: (id: string) => void;
}

export function ModelSelector({ models, selectedModel, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      `${m.name} ${m.id}`.toLowerCase().includes(q)
    );
  }, [models, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelSelectorModel[]>();
    for (const model of filtered) {
      const key = model.provider || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(model);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const selected = models.find((m) => m.id === selectedModel);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-2 py-1.5 rounded-full bg-muted/60 text-xs text-muted-foreground hover:bg-muted/80 transition-colors max-w-[150px] sm:max-w-[200px] md:max-w-none min-w-0"
      >
        {selected?.provider && getProviderIconUrl(selected.provider) ? (
          <img
            src={getProviderIconUrl(selected.provider)}
            alt=""
            className="h-3.5 w-3.5 rounded-full"
          />
        ) : null}
        <span className="text-foreground/80 truncate">
          {selected?.name || "Select model"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 flex-row items-center gap-2 space-y-0">
            <DialogTitle className="text-sm">Select model</DialogTitle>
            <Link
              href="/settings/api-keys"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Info className="h-3.5 w-3.5" />
              <span>Click here to add an API key</span>
            </Link>
          </DialogHeader>
          
          <div className="px-4 pb-4 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="h-9 pl-9"
              />
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-2 pb-4">
            {grouped.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No models found.
              </div>
            ) : (
              grouped.map(([provider, items]) => (
                <div key={provider} className="px-2 pb-3">
                  <div className="px-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {provider}
                  </div>
                  <div className="space-y-1">
                    {items.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelect(model.id);
                          setOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/60 transition-colors"
                      >
                        <div className="h-6 w-6 flex items-center justify-center overflow-hidden rounded-full bg-white shadow-xs">
                          {getProviderIconUrl(model.provider) ? (
                            <img
                              src={getProviderIconUrl(model.provider)}
                              alt=""
                              className="h-4 w-4 rounded-full"
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {model.provider.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 text-sm text-foreground text-left">
                          {model.name}
                        </div>
                        {selectedModel === model.id ? (
                          <Check className="h-4 w-4 text-foreground" />
                        ) : (
                          <div className="h-4 w-4" />
                        )}
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

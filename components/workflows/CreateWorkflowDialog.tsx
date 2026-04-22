"use client";

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Workflow } from "@/types/workflows";
import { cn } from "@/lib/utils";

interface CreateWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (workflow: Workflow) => void;
}

interface GeneratedPreview {
  workflow: Workflow;
  schedule?: { name: string; cron_expression: string } | null;
  default_params?: Record<string, unknown>;
  discovered_tools_count?: number;
}

const EXAMPLES = [
  "Summarize the README of microsoft/vscode every 5 minutes",
  "Every Monday at 9am, check GitHub issues for my-org/my-repo and email me a summary",
  "Every day at 6pm, search today's stock news and tell me if the market is positive",
  "Analyze new PRs on my repo and auto-comment with code review feedback",
];

export function CreateWorkflowDialog({ open, onClose, onSuccess }: CreateWorkflowDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);

  function reset() {
    setPrompt("");
    setError(null);
    setLoading(false);
    setPreview(null);
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError("Describe what you want this workflow to do");
      return;
    }

    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/workflows/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const body = (await res.json()) as GeneratedPreview & { error?: string };

      if (!res.ok) {
        setError(body.error ?? "Failed to generate workflow");
        return;
      }

      setPreview(body);
      onSuccess?.(body.workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Create New Workflow
          </DialogTitle>
          <DialogDescription>
            Describe what you want automated — AI will design the script, schedule, and params for you.
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
              <CheckCircle2 className="w-4.5 h-4.5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  {preview.workflow.name}
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  Workflow generated successfully
                  {preview.schedule ? ` • Scheduled: ${preview.schedule.cron_expression}` : ""}
                  {preview.discovered_tools_count
                    ? ` • ${preview.discovered_tools_count} MCP tool${preview.discovered_tools_count !== 1 ? "s" : ""} detected`
                    : ""}
                </p>
              </div>
            </div>

            {preview.default_params && Object.keys(preview.default_params).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Default Inputs
                </p>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-mono space-y-1">
                  {Object.entries(preview.default_params).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-muted-foreground">{k}:</span>
                      <span className="text-foreground">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              You can edit the script, params, and schedule on the workflow detail page.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. Every 5 minutes, fetch the README of microsoft/vscode and summarize it"
                rows={4}
                className="resize-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+Enter</kbd> to generate
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Examples
              </p>
              <div className="flex flex-col gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className={cn(
                      "text-left text-xs px-3 py-2 rounded-lg border border-border",
                      "hover:bg-accent/50 hover:border-border/80 transition-colors",
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={loading}
          >
            {preview ? "Close" : "Cancel"}
          </Button>

          {preview ? (
            <Button onClick={() => { reset(); onClose(); }} className="gap-2">
              View Workflow
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Workflow
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

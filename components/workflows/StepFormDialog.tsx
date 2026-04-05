"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkflowStep } from "@/types/workflows";

interface StepFormDialogProps {
  workflowId: string;
  step?: WorkflowStep | null;
  open: boolean;
  onClose: () => void;
  onSaved: (step: WorkflowStep) => void;
}

const TOOLKITS = [
  { value: "ai", label: "AI (Reasoning, analysis, generation)" },
  { value: "github", label: "GitHub" },
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack" },
  { value: "http", label: "HTTP / API" },
  { value: "webhook", label: "Webhook" },
  { value: "database", label: "Database" },
  { value: "file", label: "File" },
  { value: "custom", label: "Custom MCP Tool" },
];

const AI_MODELS = [
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "openai/gpt-4.1", label: "GPT-4.1" },
  { value: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek/deepseek-reasoner", label: "DeepSeek Reasoner" },
  { value: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

export function StepFormDialog({
  workflowId,
  step,
  open,
  onClose,
  onSaved,
}: StepFormDialogProps) {
  const isEditing = !!step;

  const [name, setName] = useState("");
  const [toolkit, setToolkit] = useState("ai");
  const [toolSlug, setToolSlug] = useState("openai/gpt-4o");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [argsJson, setArgsJson] = useState("{}");
  const [argsError, setArgsError] = useState<string | null>(null);
  const [timeout, setTimeout_] = useState(120);
  const [retryOnFailure, setRetryOnFailure] = useState(true);
  const [maxRetries, setMaxRetries] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseJsonObject(
    input: string
  ): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: "Must be a JSON object {}" };
      }
      return { ok: true, value: parsed as Record<string, unknown> };
    } catch {
      return {
        ok: false,
        error: "Invalid JSON. If using {{params.x}} templates, wrap them in quotes.",
      };
    }
  }

  useEffect(() => {
    if (!open) return;
    if (step) {
      setName(step.name);
      setToolkit(step.toolkit);
      setToolSlug(step.tool_slug);
      setTimeout_(step.timeout_seconds);
      setRetryOnFailure(step.retry_on_failure);
      setMaxRetries(step.max_retries);

      if (step.toolkit === "ai") {
        const args = step.tool_arguments ?? {};
        setSystemPrompt((args.system_prompt as string) ?? "");
        setUserPrompt((args.user_prompt as string) ?? "");
        const { system_prompt: _s, user_prompt: _u, ...rest } = args;
        setArgsJson(Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : "{}");
      } else {
        setArgsJson(JSON.stringify(step.tool_arguments ?? {}, null, 2));
        setSystemPrompt("");
        setUserPrompt("");
      }
    } else {
      setName("");
      setToolkit("ai");
      setToolSlug("openai/gpt-4o");
      setSystemPrompt("You are a helpful AI assistant.");
      setUserPrompt("");
      setArgsJson("{}");
      setTimeout_(120);
      setRetryOnFailure(true);
      setMaxRetries(1);
    }
    setError(null);
    setArgsError(null);
  }, [open, step]);

  function buildToolArguments(): Record<string, unknown> | null {
    if (toolkit === "ai") {
      if (!userPrompt.trim()) {
        setError("User prompt is required for AI steps");
        return null;
      }
      const parsed = parseJsonObject(argsJson);
      if (!parsed.ok) {
        setArgsError(parsed.error);
        return null;
      }
      return {
        system_prompt: systemPrompt.trim() || "You are a helpful AI assistant.",
        user_prompt: userPrompt.trim(),
        ...parsed.value,
      };
    }

    const parsed = parseJsonObject(argsJson);
    if (!parsed.ok) {
      setArgsError(parsed.error);
      return null;
    }
    return parsed.value;
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Step name is required");
      return;
    }
    if (!toolSlug.trim()) {
      setError("Tool/model is required");
      return;
    }

    const toolArgs = buildToolArguments();
    if (toolArgs === null) return;

    setLoading(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/workflows/${workflowId}/steps/${step!.id}`
        : `/api/workflows/${workflowId}/steps`;

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          toolkit,
          tool_slug: toolSlug.trim(),
          tool_arguments: toolArgs,
          timeout_seconds: timeout,
          retry_on_failure: retryOnFailure,
          max_retries: maxRetries,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        setError(`Server error (${res.status}): ${text.slice(0, 120)}`);
        return;
      }

      const body = (await res.json()) as { step?: WorkflowStep; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Failed to save step");
        return;
      }

      onSaved(body.step!);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const isAI = toolkit === "ai";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Step" : "Add Step"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modify this step's configuration"
              : "Add a new step to the workflow"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Step Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summarize README"
              autoFocus
            />
          </div>

          {/* Toolkit */}
          <div className="space-y-1.5">
            <Label>Toolkit</Label>
            <Select value={toolkit} onValueChange={(v) => {
              setToolkit(v);
              if (v === "ai" && !toolSlug.includes("/")) setToolSlug("openai/gpt-4o");
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOOLKITS.map((tk) => (
                  <SelectItem key={tk.value} value={tk.value}>
                    {tk.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tool slug / AI model */}
          <div className="space-y-1.5">
            <Label>{isAI ? "AI Model" : "Tool Name (MCP tool slug)"}</Label>
            {isAI ? (
              <Select value={toolSlug} onValueChange={setToolSlug}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={toolSlug}
                onChange={(e) => setToolSlug(e.target.value)}
                placeholder="e.g. get_readme, search_issues"
                className="font-mono text-sm"
              />
            )}
          </div>

          {/* AI-specific prompt fields */}
          {isAI && (
            <>
              <div className="space-y-1.5">
                <Label>System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  placeholder="You are a helpful AI assistant..."
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  User Prompt{" "}
                  <span className="font-normal text-xs text-muted-foreground">
                    (use {"{{params.xyz}}"} for inputs, {"{{steps.1.output.content}}"} for previous step output)
                  </span>
                </Label>
                <Textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={4}
                  placeholder="Fetch the README from {{params.repo_owner}}/{{params.repo_name}} and summarize it..."
                  className="text-sm"
                />
              </div>
            </>
          )}

          {/* Extra arguments (always available) */}
          <div className="space-y-1.5">
            <Label>
              {isAI ? "Extra Arguments" : "Tool Arguments"}{" "}
              <span className="font-normal text-xs text-muted-foreground">(JSON)</span>
            </Label>
            <Textarea
              value={argsJson}
              onChange={(e) => {
                setArgsJson(e.target.value);
                setArgsError(null);
              }}
              rows={3}
              className="font-mono text-xs"
              placeholder="{}"
            />
            {argsError && <p className="text-xs text-destructive">{argsError}</p>}
          </div>

          {/* Timeout & retry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Timeout (seconds)</Label>
              <Input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout_(Number(e.target.value))}
                min={5}
                max={600}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Retries</Label>
              <Input
                type="number"
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                min={0}
                max={5}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Retry on Failure</p>
              <p className="text-xs text-muted-foreground">
                Automatically retry if the step fails due to a transient error
              </p>
            </div>
            <Switch checked={retryOnFailure} onCheckedChange={setRetryOnFailure} />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Step
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

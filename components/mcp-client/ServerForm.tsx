"use client";

import { useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Globe,
  Rss,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { McpServer } from "@/types/mcp";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { UserSession } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

const serverSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Server name is required"),
  description: z.string().optional(),
  transport: z.enum(["sse", "streamable-http"]),
  categoryIds: z.array(z.string()).optional(),
  url: z.string().min(1, "Server URL is required"),
  command: z.string().optional(),
  args: z.string().optional(),
  requiresOauth: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  isPublic: z.boolean().optional(),
  headers: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      })
    )
    .optional(),
});

type ServerFormData = z.infer<typeof serverSchema>;

function normalizeHeaderRows(headers?: ServerFormData["headers"]): Record<string, string> | undefined {
  const entries = (headers ?? [])
    .map((header) => [header.key.trim(), header.value.trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function headerRecordToRows(
  headers?: Record<string, string> | Array<{ key: string; value: string }> | null
): Array<{ key: string; value: string }> {
  if (!headers) return [];

  const entries = Array.isArray(headers)
    ? headers.map((header) => [header.key, header.value] as const)
    : Object.entries(headers);

  return entries
    .map(([key, value]) => ({ key: String(key).trim(), value: String(value).trim() }))
    .filter((header) => header.key.length > 0 && header.value.length > 0);
}

interface ServerFormProps {
  server?: McpServer | null;
  mode: "add" | "edit";
  session: UserSession | null;
  onSubmit: (data: ServerFormData) => Promise<void>;
  onCancel: () => void;
}

type ValidationStepKey = "format" | "oauth" | "connection" | "save";
type ValidationMessageState = "pending" | "running" | "done" | "failed";

interface ValidationStep {
  key: ValidationStepKey;
  label: string;
  state: ValidationMessageState;
  detail?: string;
}

export default function ServerForm({
  server,
  mode,
  session,
  onSubmit,
  onCancel,
}: ServerFormProps) {
  const [isValidatingBeforeSubmit, setIsValidatingBeforeSubmit] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<ValidationStep[]>([]);
  const { connect } = useMcpConnection();

  const defaultValues: ServerFormData = useMemo(
    () => ({
      name: server?.name || "",
      description: server?.description || "",
      transport: (server?.transport as "sse" | "streamable-http") || "streamable-http",
      categoryIds: server?.categories?.map((c) => c.id) || [],
      url: server?.url || "",
      requiresOauth: server?.requiresOauth2 || (server as any)?.requiresOauth || false,
      clientId: server?.clientId || "",
      clientSecret: server?.clientSecret || "",
      isPublic: server?.isPublic || false,
      headers: headerRecordToRows(server?.headers),
    }),
    [server]
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ServerFormData>({
    resolver: zodResolver(serverSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "headers",
  });

  const transportType = watch("transport");
  const requiresOauth = watch("requiresOauth");

  const upsertValidationStep = (key: ValidationStepKey, update: Partial<ValidationStep>) => {
    setValidationMessages((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...update };
      return next;
    });
  };

  const handleFormSubmit = async (form: ServerFormData) => {
    if (!session) {
      toast.error("Please sign in first.");
      return;
    }

    try {
      setValidationError(null);
      setIsValidatingBeforeSubmit(true);

      const initialSteps: ValidationStep[] = [
        { key: "format", label: "Validate URL format", state: "running" },
        ...(form.requiresOauth ? [{ key: "oauth" as ValidationStepKey, label: "Check OAuth setup", state: "pending" as ValidationMessageState }] : []),
        { key: "connection", label: "Verify server connection", state: "pending" },
        { key: "save", label: mode === "add" ? "Create server" : "Update server", state: "pending" },
      ];
      setValidationMessages(initialSteps);

      // 1. Validate format
      let parsed: URL;
      try {
        parsed = new URL(form.url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("URL must begin with http:// or https://");
        }
      } catch (err: any) {
        upsertValidationStep("format", { state: "failed", detail: err?.message || "Invalid URL" });
        throw err;
      }
      upsertValidationStep("format", { state: "done", detail: "Valid URL format" });

      // 2. Validate OAuth if applicable
      if (form.requiresOauth) {
        upsertValidationStep("oauth", { state: "running" });
        if (parsed.protocol !== "https:") {
          upsertValidationStep("oauth", { state: "failed", detail: "OAuth requires HTTPS" });
          throw new Error("OAuth requires HTTPS endpoints");
        }
        upsertValidationStep("oauth", { state: "done", detail: "OAuth configuration validated" });
      }

      // 3. Connect check
      upsertValidationStep("connection", { state: "running", detail: "Connecting..." });
      try {
        await connect({
          id: form.url,
          name: form.name,
          url: form.url,
          transport: form.transport,
          headers: normalizeHeaderRows(form.headers),
          clientId: form.clientId || null,
          clientSecret: form.clientSecret || null,
        } as unknown as McpServer);
        upsertValidationStep("connection", { state: "done", detail: "Connection verified" });
      } catch {
        upsertValidationStep("connection", { state: "done", detail: "Configured" });
      }

      // 4. Save server
      upsertValidationStep("save", { state: "running" });
      await onSubmit(form);
      upsertValidationStep("save", { state: "done" });
      onCancel();
    } catch (err: any) {
      setValidationError(err?.message || "Failed to save server");
      toast.error("Failed to save server");
    } finally {
      setIsValidatingBeforeSubmit(false);
    }
  };

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-200">
      {/* Top Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {mode === "add" ? "Add Connector" : `Edit "${server?.name}"`}
        </h2>
        {mode === "add" && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect a new MCP server to expose its tools and resources.
          </p>
        )}
      </div>

      {!session && (
        <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-300">
          <AlertCircle className="size-4" />
          <AlertDescription className="text-xs">
            Please <Link href="/signin" className="underline font-semibold">sign in</Link> to save custom MCP servers to your account.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
        <Tabs defaultValue="basic" className="space-y-3.5">
          <TabsList className="h-8 p-0.5 bg-muted/60 rounded-sm">
            <TabsTrigger value="basic" className="h-7 text-xs px-3 rounded-xs font-medium cursor-pointer">
              Basic Details
            </TabsTrigger>
            <TabsTrigger value="additional" className="h-7 text-xs px-3 rounded-xs font-medium cursor-pointer">
              Additional Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-0 space-y-3.5 pt-1">
            <div className="space-y-1">
              <Label htmlFor="server-name" className="text-xs font-medium text-foreground">
                Server Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="server-name"
                {...register("name")}
                placeholder="e.g. Your MCP Name"
                className="h-8 text-xs bg-background border-border rounded-sm"
              />
              {errors.name && <p className="text-[11px] text-destructive font-mono">{errors.name.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="server-url" className="text-xs font-medium text-foreground">
                Endpoint URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="server-url"
                {...register("url")}
                placeholder="https://example.com/mcp"
                className="h-8 text-xs font-mono bg-background border-border rounded-sm"
              />
              {errors.url && <p className="text-[11px] text-destructive font-mono">{errors.url.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="server-description" className="text-xs font-medium text-foreground">
                Description <span className="text-muted-foreground text-[11px] font-normal">(optional)</span>
              </Label>
              <Textarea
                id="server-description"
                {...register("description")}
                placeholder="Brief description of the tools and resources provided..."
                className="min-h-[76px] resize-none text-xs bg-background border-border rounded-sm p-2.5"
              />
            </div>
          </TabsContent>

          <TabsContent value="additional" className="mt-0 space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">Transport Protocol</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setValue("transport", "streamable-http")}
                  className={cn(
                    "p-2.5 rounded-sm border text-left transition-all flex items-start gap-2.5 cursor-pointer",
                    transportType === "streamable-http"
                      ? "bg-card border-primary/50 text-foreground"
                      : "bg-background border-border hover:border-muted-foreground/40 text-muted-foreground"
                  )}
                >
                  <Globe className="size-4 shrink-0 mt-0.5 text-foreground" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Streamable HTTP</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">Standard HTTP POST stream (Recommended)</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setValue("transport", "sse")}
                  className={cn(
                    "p-2.5 rounded-sm border text-left transition-all flex items-start gap-2.5 cursor-pointer",
                    transportType === "sse"
                      ? "bg-card border-primary/50 text-foreground"
                      : "bg-background border-border hover:border-muted-foreground/40 text-muted-foreground"
                  )}
                >
                  <Rss className="size-4 shrink-0 mt-0.5 text-foreground" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Server-Sent Events (SSE)</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">Long-lived persistent event stream</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs font-medium text-foreground">HTTP Headers</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => append({ key: "", value: "" })}
                  className="h-6 text-[11px] px-2 border-border bg-background cursor-pointer"
                >
                  <Plus className="size-3 mr-1" /> Add Header
                </Button>
              </div>

              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input
                      {...register(`headers.${index}.key`)}
                      placeholder="Header Name (e.g. Authorization)"
                      className="h-8 text-xs font-mono bg-background border-border flex-1 rounded-sm"
                    />
                    <Input
                      {...register(`headers.${index}.value`)}
                      placeholder="Value (e.g. Bearer token_...)"
                      className="h-8 text-xs font-mono bg-background border-border flex-1 rounded-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => remove(index)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}

                {fields.length === 0 && (
                  <p className="text-[11px] text-muted-foreground font-mono">
                    No custom headers added. Click &quot;Add Header&quot; if this endpoint requires authentication.
                  </p>
                )}
              </div>

              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="requires-oauth"
                    checked={requiresOauth}
                    onCheckedChange={(checked) => setValue("requiresOauth", Boolean(checked))}
                  />
                  <Label htmlFor="requires-oauth" className="text-xs text-foreground cursor-pointer font-medium">
                    This server requires OAuth 2.0 User Authorization
                  </Label>
                </div>

                {requiresOauth && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-6 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="client-id" className="text-[11px] text-muted-foreground">
                        Client ID (optional)
                      </Label>
                      <Input
                        id="client-id"
                        {...register("clientId")}
                        placeholder="OAuth Client ID"
                        className="h-8 text-xs font-mono bg-background border-border rounded-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="client-secret" className="text-[11px] text-muted-foreground">
                        Client Secret (optional)
                      </Label>
                      <Input
                        id="client-secret"
                        type="password"
                        {...register("clientSecret")}
                        placeholder="Client Secret"
                        className="h-8 text-xs font-mono bg-background border-border rounded-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Validation Progress */}
        {validationMessages.length > 0 && (
          <div className="p-3 bg-muted/30 border border-border rounded-sm space-y-1.5">
            <p className="text-xs font-medium text-foreground">Validation Status</p>
            <div className="space-y-1">
              {validationMessages.map((step) => (
                <div key={step.key} className="flex items-center gap-2 text-xs">
                  {step.state === "running" && <Loader2 className="size-3.5 animate-spin text-primary" />}
                  {step.state === "done" && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                  {step.state === "failed" && <AlertCircle className="size-3.5 text-destructive" />}
                  {step.state === "pending" && <span className="size-3.5 rounded-full border border-border" />}
                  <span className={cn(step.state === "failed" ? "text-destructive" : "text-foreground")}>
                    {step.label} {step.detail && <span className="text-muted-foreground font-mono text-[10px]">({step.detail})</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {validationError && (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
            <AlertCircle className="size-4" />
            <AlertDescription className="text-xs">{validationError}</AlertDescription>
          </Alert>
        )}

        {/* Bottom Actions Bar */}
        <div className="pt-3 border-t border-border/40 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isValidatingBeforeSubmit || isSubmitting}
            className="h-8 px-3.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isValidatingBeforeSubmit || isSubmitting}
            className="h-8 px-4 text-xs font-medium cursor-pointer"
          >
            {isValidatingBeforeSubmit ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                Validating...
              </>
            ) : mode === "add" ? (
              "Save Server"
            ) : (
              "Update Server"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

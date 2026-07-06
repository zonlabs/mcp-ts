"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Trash2,
  ChevronDown,
  Rss,
  Globe,
  AlertCircle,
  Save,
  Edit2,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { McpServer } from "@/types/mcp";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { Category } from "@/types/mcp";
import { useMcpStore, type StoredConnection } from "@/lib/stores/mcp-store";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { UserSession } from "@/components/providers/AuthProvider";
import { useCategories } from "@/hooks/useCategories";

const serverSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Server name is required"),
  description: z.string().optional(),
  transport: z.enum(["sse", "streamable-http"]),
  categoryIds: z.array(z.string()).optional(),
  url: z.string().optional(),
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

type ValidationMessageState = "pending" | "running" | "done" | "failed";

type ValidationMessage = {
  key: string;
  label: string;
  detail?: string;
  state: ValidationMessageState;
};

const STEP_LABELS: Record<string, string> = {
  format: "Input Validation",
  oauth: "OAuth",
  connection: "Connect to Server",
  save: "Submit",
};

const CONNECTION_STATUS_DETAILS: Record<string, string> = {
  INITIALIZING: "Initializing connection...",
  VALIDATING: "Validating connection...",
  CONNECTING: "Connecting to server...",
  AUTHENTICATING: "Authentication in progress...",
  AUTHENTICATED: "Authentication completed.",
  DISCOVERING: "Discovering available tools...",
  CONNECTED: "Connected. Finalizing setup...",
  READY: "Connection verified successfully.",
  FAILED: "Connection retry in progress...",
};

const normalizeUrl = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin}${path}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
};

export default function ServerForm({
  server,
  mode,
  session,
  onSubmit,
  onCancel,
}: ServerFormProps) {
  const [transportType, setTransportType] = useState<"sse" | "streamable-http">("streamable-http");
  const [useCustomTransport, setUseCustomTransport] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [isValidatingBeforeSubmit, setIsValidatingBeforeSubmit] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<ValidationMessage[]>([]);
  const [connectionStatusTrail, setConnectionStatusTrail] = useState<string[]>([]);
  const { connect: activateServerConnection } = useMcpConnection();

  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    control,
    watch,
    setValue,
  } = useForm<ServerFormData>({
    resolver: zodResolver(serverSchema),
    defaultValues: {
      name: "",
      description: "",
      transport: "streamable-http",
      categoryIds: [],
      url: "",
      command: "",
      args: "",
      requiresOauth: false,
      clientId: "",
      clientSecret: "",
      isPublic: false,
      headers: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "headers",
  });

  const watchedTransport = watch("transport");
  const watchedRequiresOauth = watch("requiresOauth");
  const watchedIsPublic = watch("isPublic");

  const buildInitialValidationSteps = ({
    requiresValidation,
    requiresOauth,
  }: {
    requiresValidation: boolean;
    requiresOauth: boolean;
  }): ValidationMessage[] => {
    if (!requiresValidation) {
      return [{ key: "save", label: STEP_LABELS.save, state: "pending", detail: "Waiting to submit..." }];
    }

    const keys = ["format", ...(requiresOauth ? ["oauth"] : []), "connection", "save"];
    return keys.map((key) => ({
      key,
      label: STEP_LABELS[key] || key,
      state: "pending" as ValidationMessageState,
      detail: "Pending...",
    }));
  };

  useEffect(() => {
    setTransportType(watchedTransport);
  }, [watchedTransport]);

  useEffect(() => {
    if (mode === "edit" && server) {
      const categoryIds = server.categories ? server.categories.map((cat) => cat.id) : [];
      setSelectedCategoryIds(categoryIds);

      reset({
        id: server.id,
        name: server.name,
        description: server.description || "",
        transport: server.transport as "sse" | "streamable-http",
        categoryIds,
        url: server.url || "",
        command: server.command || "",
        args: server.args
          ? typeof server.args === "string"
            ? server.args
            : JSON.stringify(server.args)
          : "",
        requiresOauth: server.requiresOauth2 || false,
        clientId: server.clientId || "",
        clientSecret: server.clientSecret || "",
        isPublic: server.isPublic || false,
        headers: headerRecordToRows(server.headers),
      });
      setTransportType(server.transport as "sse" | "streamable-http");
      setUseCustomTransport(true);
    } else {
      setSelectedCategoryIds([]);
      reset({
        name: "",
        description: "",
        transport: "streamable-http",
        categoryIds: [],
        url: "",
        command: "",
        args: "",
        requiresOauth: false,
        clientId: "",
        clientSecret: "",
        isPublic: false,
        headers: [],
      });
      setTransportType("streamable-http");
      setUseCustomTransport(false);
    }

    setValidationMessages([]);
    setConnectionStatusTrail([]);
    setValidationError(null);
    setIsValidatingBeforeSubmit(false);
  }, [mode, server, reset]);

  const upsertValidationMessage = (
    key: string,
    patch: Partial<ValidationMessage>
  ) => {
    setValidationMessages((prev) => {
      const idx = prev.findIndex((item) => item.key === key);
      if (idx === -1) {
        return [
          ...prev,
          {
            key,
            label: patch.label || STEP_LABELS[key] || key,
            state: patch.state || "pending",
            detail: patch.detail || "Pending...",
          },
        ];
      }

      const next = [...prev];
      next[idx] = {
        ...next[idx],
        ...patch,
        label: patch.label || next[idx].label,
      };
      return next;
    });
  };

  const waitForConnectionVerification = async (
    expectedServerName: string,
    expectedUrl: string,
    onStatus: (status: string) => void
  ): Promise<{ status: "READY" | "FAILED"; toolCount: number; sessionId?: string }> => {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let unsubscribe: (() => void) | undefined;

      const targetUrl = normalizeUrl(expectedUrl);
      const targetName = expectedServerName.trim().toLowerCase();

      const settle = (result: { status: "READY" | "FAILED"; toolCount: number; sessionId?: string }) => {
        if (settled) return;
        settled = true;
        if (unsubscribe) unsubscribe();
        resolve(result);
      };

      const evaluate = (connectionsMap: Record<string, StoredConnection>) => {
        const connections = Object.values(connectionsMap || {});
        const candidates = connections.filter((c) => {
          if (!c?.sessionId) return false;
          const byName = String(c.serverName || "").trim().toLowerCase() === targetName;
          const byUrl = normalizeUrl(c.url) === targetUrl;
          return byName || byUrl;
        });
        const match = candidates[candidates.length - 1];

        if (!match) return;

        const status = String(match.connectionStatus || "").toUpperCase();
        onStatus(status);
        if (status === "READY" || status === "FAILED") {
          settle({
            status: status as "READY" | "FAILED",
            toolCount: Array.isArray(match.tools) ? match.tools.length : 0,
            sessionId: match.sessionId,
          });
        }
      };

      unsubscribe = useMcpStore.subscribe((state) => {
        evaluate(state.connections);
      });

      // Immediate check in case state already changed before subscription callback.
      evaluate(useMcpStore.getState().connections);

      // Timeout — if the connection never reaches a terminal state (READY/FAILED),
      // give the form back so the user can retry.
      setTimeout(() => {
        if (!settled) {
          settled = true;
          if (unsubscribe) unsubscribe();
          reject(new Error('Connection verification timed out'));
        }
      }, 60_000);
    });
  };

  const runServerValidation = async (form: ServerFormData) => {
    const name = String(form.name || "").trim();
    const url = String(form.url || "").trim();
    const transport = form.transport;

    if (!name || !url || !transport) {
      throw new Error("Name, URL, and transport are required.");
    }

    upsertValidationMessage("format", {
      state: "running",
      detail: "Validating URL format...",
    });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      upsertValidationMessage("format", {
        state: "failed",
        detail: "Server URL must be a valid URL.",
      });
      throw new Error("Server URL must be a valid URL.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      upsertValidationMessage("format", {
        state: "failed",
        detail: "Server URL must start with http:// or https://.",
      });
      throw new Error("Server URL must start with http:// or https://.");
    }

    upsertValidationMessage("format", {
      state: "done",
      detail: "URL format is valid.",
    });

    if (form.requiresOauth) {
      upsertValidationMessage("oauth", {
        state: "running",
        detail: "Checking OAuth configuration...",
      });
      if (parsed.protocol !== "https:") {
        upsertValidationMessage("oauth", {
          state: "failed",
          detail: "OAuth-enabled servers should use HTTPS endpoints.",
        });
        throw new Error("OAuth-enabled servers should use HTTPS endpoints.");
      }
      upsertValidationMessage("oauth", {
        state: "done",
        detail: "OAuth configuration looks valid.",
      });
    }

    upsertValidationMessage("connection", {
      state: "running",
      detail: "Starting connection check...",
    });

    try {
      setConnectionStatusTrail([]);
      const verificationServer = {
        id: url || name,
        name,
        url,
        transportType: useCustomTransport ? transport : "streamable-http",
        headers: normalizeHeaderRows(form.headers),
        clientId: form.clientId || null,
        clientSecret: form.clientSecret || null,
      };

      try {
        await activateServerConnection(verificationServer);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start connection check.";
        const normalized = message.toLowerCase();
        if (normalized.includes("connection already exists")) {
          const normalizedUrl = normalizeUrl(url);
          const normalizedName = name.toLowerCase();
          const existing = Object.values(useMcpStore.getState().connections).find((c) => {
            const byName = String(c.serverName || "").trim().toLowerCase() === normalizedName;
            const byUrl = normalizeUrl(c.url) === normalizedUrl;
            return byName || byUrl;
          });
          const existingStatus = String(existing?.connectionStatus || "").toUpperCase();
          if (existingStatus === "READY") {
            upsertValidationMessage("connection", {
              state: "done",
              detail: "Existing verified connection found (READY).",
            });
            return;
          }
          upsertValidationMessage("connection", {
            state: "running",
            detail: existingStatus
              ? `Existing connection is ${existingStatus}. Waiting for READY...`
              : "Existing connection found. Waiting for READY...",
          });
          // Continue waiting for status transitions to READY.
        } else if (normalized.includes("authorization required") || normalized.includes("oauth")) {
          upsertValidationMessage("connection", {
            state: "failed",
            detail: "Authorization required, but OAuth flow could not be started. Try again or use a static token.",
          });
          throw error;
        } else {
          throw error;
        }
      }

      const runtimeResult = await waitForConnectionVerification(
        name,
        url,
        (status) => {
          setConnectionStatusTrail((prev) => (prev.includes(status) ? prev : [...prev, status]));
          upsertValidationMessage("connection", {
            state: status === "READY" ? "done" : status === "FAILED" ? "failed" : "running",
            detail: `${CONNECTION_STATUS_DETAILS[status] || `Status: ${status}`} (${status})`,
          });
        }
      );

      if (runtimeResult.status === "READY") {
        upsertValidationMessage("connection", {
          state: "done",
          detail: `Connected successfully (${runtimeResult.toolCount} tools discovered).`,
        });
      } else {
        throw new Error(
          `Connection failed (${runtimeResult.status})`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Server connection check failed.";
      upsertValidationMessage("connection", {
        state: "failed",
        detail: message,
      });
      throw error;
    }
  };

  const handleFormSubmit = async (form: ServerFormData) => {
    if (!session) {
      toast.error("Please sign in first.");
      return;
    }

    try {
      const currentUrl = normalizeUrl(String(form.url || ""));
      const originalUrl = normalizeUrl(server?.url || "");
      const isUrlChangedOnEdit = mode === "edit" && Boolean(server) && currentUrl !== originalUrl;
      const isNewServer = mode === "add";
      const isVisibilityEnabledOnEdit =
        mode === "edit" && Boolean(form.isPublic) && !Boolean(server?.isPublic);
      const requiresValidation =
        isNewServer || isUrlChangedOnEdit || isVisibilityEnabledOnEdit;
      const requiresOauth = Boolean(form.requiresOauth);

      setValidationError(null);
      if (requiresValidation) {
        setValidationMessages(
          buildInitialValidationSteps({
            requiresValidation,
            requiresOauth,
          })
        );
        setIsValidatingBeforeSubmit(true);
        await runServerValidation(form);
        upsertValidationMessage("save", {
          state: "running",
          detail: mode === "add" ? "Creating server..." : "Updating server...",
        });
      } else {
        setValidationMessages([]);
      }

      await onSubmit(form);

      if (requiresValidation) {
        upsertValidationMessage("save", {
          state: "done",
          detail: mode === "add" ? "Server created successfully." : "Server updated successfully.",
        });
      }

      toast.success(`Server ${mode === "add" ? "added" : "updated"} successfully`);
      onCancel();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Validation failed";
      setValidationError(message);
      toast.error(`Failed to ${mode === "add" ? "add" : "update"} server`);
    } finally {
      setIsValidatingBeforeSubmit(false);
    }
  };

  const shouldShowStatus = validationMessages.length > 0;
  const orderedValidationMessages = useMemo(() => {
    const rank: Record<string, number> = {
      format: 1,
      oauth: 2,
      connection: 3,
      save: 4,
    };
    return [...validationMessages].sort((a, b) => (rank[a.key] || 99) - (rank[b.key] || 99));
  }, [validationMessages]);
  const getTopStepPillClass = (state: ValidationMessageState) => {
    if (state === "done") return "border-green-600/70 text-foreground";
    if (state === "failed") return "border-red-600/70 text-red-500";
    if (state === "running") return "border-foreground/70 text-foreground";
    return "border-transparent text-muted-foreground";
  };
  const getTimelineMarkerClass = (state: ValidationMessageState) => {
    if (state === "done") return "border-green-600 bg-green-600/20";
    if (state === "failed") return "border-red-600 bg-red-600/20";
    if (state === "running") return "border-foreground bg-foreground/15";
    return "border-muted-foreground/50 bg-background";
  };
  const getTimelineMarkerInnerClass = (state: ValidationMessageState) => {
    if (state === "done") return "bg-green-600";
    if (state === "failed") return "bg-red-600";
    if (state === "running") return "bg-foreground";
    return "bg-muted-foreground/50";
  };
  const getTimelineItemClass = (_state: ValidationMessageState) => {
    return "";
  };

  return (
    <div className="h-full flex flex-col bg-background animate-in slide-in-from-bottom-4 duration-300 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Edit2 className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">{mode === "add" ? "Add New Server" : "Edit Server"}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full mx-auto space-y-8">
          {!session && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
                Please <Link href="/signin" className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-100">sign in</Link> first.
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-auto bg-transparent p-0 rounded-none border-b border-border/70">
              <TabsTrigger
                value="basic"
                className="rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent pb-2 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Basic Info
              </TabsTrigger>
              <TabsTrigger
                value="additional"
                className="rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent pb-2 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Additional Info
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="pt-4 space-y-4">
              <h3 className="text-lg font-medium border-b pb-2">Basic Information</h3>

              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">Server Name</Label>
                <Input {...register("name")} id="name" placeholder="My MCP Server" className="h-10" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="description" className="text-xs">Description</Label>
                <Textarea
                  {...register("description")}
                  id="description"
                  placeholder="What does this server do? (optional/markdown supported)"
                  className="min-h-[100px] resize-none leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">Markdown supported. Help others understand this server.</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="url" className="text-xs">Server URL</Label>
                <Input
                  {...register("url")}
                  id="url"
                  placeholder="https://mcp.example.com/token/mcp"
                  className="h-10 font-mono text-sm"
                />
                {errors.url && <p className="text-red-500 text-xs mt-1">{errors.url.message}</p>}
              </div>
            </TabsContent>

            <TabsContent value="additional" className="pt-4 space-y-6 px-1 pb-4">
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b border-border/80 pb-2">Connection Configuration</h3>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Transport Type</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setUseCustomTransport((prev) => !prev)}
                    >
                      {useCustomTransport ? "Use Auto" : "Set Manually"}
                    </Button>
                  </div>

                  {!useCustomTransport ? (
                    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      Auto (recommended) - transport is selected automatically.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                      <label
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          transportType === "streamable-http"
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-muted hover:border-primary/50 hover:bg-muted/50"
                        }`}
                      >
                        <input type="radio" {...register("transport")} value="streamable-http" className="sr-only" />
                        <Globe className="h-5 w-5 mb-2" />
                        <span className="font-semibold text-sm">HTTP</span>
                        <span className="text-[10px] text-muted-foreground">Streamable HTTP</span>
                      </label>
                      <label
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          transportType === "sse"
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-muted hover:border-primary/50 hover:bg-muted/50"
                        }`}
                      >
                        <input type="radio" {...register("transport")} value="sse" className="sr-only" />
                        <Rss className="h-5 w-5 mb-2" />
                        <span className="font-semibold text-sm">SSE</span>
                        <span className="text-[10px] text-muted-foreground">Server-Sent Events</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/80 pb-2">
                  <h3 className="text-lg font-medium">HTTP Headers</h3>
                  <Button type="button" variant="default" size="sm" onClick={() => append({ key: "", value: "" })} className="h-8 text-xs">
                    <Plus className="mr-1 h-3 w-3" />
                    Add Header
                  </Button>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2 group">
                      <Input
                        {...register(`headers.${index}.key`)}
                        placeholder="Authorization"
                        className="w-1/3 h-9 font-mono text-xs"
                      />
                      <Input
                        {...register(`headers.${index}.value`)}
                        placeholder="Bearer token123"
                        className="flex-1 h-9 font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {fields.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed rounded-lg text-muted-foreground text-sm">
                      No custom headers configured.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b border-border/80 pb-2">Authentication</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-2">
                  <div className="flex items-start space-x-3 py-3 border-b">
                    <Controller
                      name="requiresOauth"
                      control={control}
                      render={({ field }) => (
                        <Checkbox
                          id="requiresOauth"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-0.5"
                        />
                      )}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="requiresOauth" className="text-sm font-medium">OAuth</Label>
                      <p className="text-xs text-muted-foreground">Enable if the server requires OAuth.</p>
                    </div>
                  </div>
                </div>

                {watchedRequiresOauth && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-border/50">
                    <div className="space-y-2">
                      <Label htmlFor="clientId" className="text-sm font-medium">OAuth Client ID</Label>
                      <Input
                        id="clientId"
                        placeholder="Enter Client ID"
                        {...register("clientId")}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Your registered OAuth Client Identifier from Google / GitHub.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientSecret" className="text-sm font-medium">OAuth Client Secret (Optional)</Label>
                      <Input
                        id="clientSecret"
                        type="password"
                        placeholder="Enter Client Secret"
                        {...register("clientSecret")}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Optional for public OAuth clients, required for web apps.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b border-border/80 pb-2">Metadata & Visibility</h3>

                <div className="flex items-start space-x-3 py-3 border-b border-border/50">
                  <Controller
                    name="isPublic"
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        id="isPublic"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          // Clear selected categories if visibility is unchecked
                          if (!checked) {
                            setSelectedCategoryIds([]);
                            setValue("categoryIds", []);
                          }
                        }}
                        className="mt-0.5"
                      />
                    )}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="isPublic" className="text-sm font-medium">Visibility</Label>
                    <p className="text-xs text-muted-foreground">Enable to list this server publicly in the catalog.</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="categoryIds" className={`text-xs ${!watchedIsPublic ? "text-muted-foreground/50" : ""}`}>
                    Categories
                  </Label>
                  {categoriesLoading ? (
                    <p className="text-xs text-muted-foreground">Loading categories...</p>
                  ) : categoriesError ? (
                    <p className="text-xs text-red-500">{categoriesError}</p>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!watchedIsPublic}
                          className="w-full h-10 justify-between text-sm font-normal disabled:opacity-50"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {selectedCategoryIds.length > 0 ? (
                              selectedCategoryIds.map((id) => {
                                const category = categories.find((c) => c.id === id);
                                if (!category) return null;
                                return (
                                  <div key={id} className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded">
                                    {category.icon &&
                                      (category.icon.includes(".") ? (
                                        <Image src={`/categories/${category.icon}`} alt={category.name} width={14} height={14} />
                                      ) : (
                                        <span className="text-xs">{category.icon}</span>
                                      ))}
                                    <span className="text-xs">{category.name}</span>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-muted-foreground">
                                {watchedIsPublic ? "Select categories..." : "Select categories (Enable visibility first)"}
                              </span>
                            )}
                          </div>
                          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[300px]" align="start">
                        {categories.map((node) => (
                          <DropdownMenuCheckboxItem
                            key={node.id}
                            checked={selectedCategoryIds.includes(node.id)}
                            onCheckedChange={(checked) => {
                              const newIds = checked
                                ? [...selectedCategoryIds, node.id]
                                : selectedCategoryIds.filter((cid) => cid !== node.id);
                              setSelectedCategoryIds(newIds);
                              setValue("categoryIds", newIds);
                            }}
                          >
                            {node.name}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2">
            {shouldShowStatus && (
              <div className="mr-auto min-w-[320px] max-w-[640px] py-1">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-border/70 px-1">
                    {orderedValidationMessages.map((message) => (
                      <div
                        key={message.key}
                        className={`inline-flex min-h-8 items-center justify-center border-b-2 px-2 py-1 text-[11px] font-medium transition-colors ${getTopStepPillClass(message.state)}`}
                      >
                        <span className="leading-none">{message.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="relative ml-1 pl-1">
                    {orderedValidationMessages.map((message) => (
                      <div key={`${message.key}-detail`} className="relative pb-3 pl-8 text-xs last:pb-0">
                        <span
                          className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${getTimelineMarkerClass(message.state)}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${getTimelineMarkerInnerClass(message.state)}`} />
                        </span>
                        <div className={`min-w-0 py-0.5 ${getTimelineItemClass(message.state)}`}>
                            <p className="font-medium text-foreground">{message.label}</p>
                            <p className="mt-0.5 text-muted-foreground break-words">{message.detail || "Pending..."}</p>
                            {message.key === "connection" && connectionStatusTrail.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {connectionStatusTrail.map((status) => (
                                  <span
                                    key={status}
                                    className="rounded-sm border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    {status}
                                  </span>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {validationError && <p className="text-xs text-red-500">{validationError}</p>}
                </div>
              </div>
            )}

            <Button variant="ghost" onClick={onCancel}>Cancel</Button>

            <Button
              onClick={handleSubmit(handleFormSubmit)}
              disabled={!session || isSubmitting || isValidatingBeforeSubmit}
              className="gap-2"
            >
              {isSubmitting || isValidatingBeforeSubmit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isValidatingBeforeSubmit
                ? "Validating..."
                : mode === "add"
                  ? "Submit"
                  : "Update Server"}
            </Button>
          </div>

          <div className="h-12" />
        </div>
      </div>
    </div>
  );
}

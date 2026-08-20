"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { ToolInfo, McpServer } from "@/types/mcp";
import { toast } from "react-hot-toast";
import {
  AlertCircle,
  CheckCircle,
  Loader,
  X,
  ChevronDown,
  ChevronUp,
  Play,
  Save,
  RotateCcw,
  ChevronLeft,
  Search,
  Hammer,
  History,
  Trash2,
  Bookmark,
  Database,
  Boxes,
} from "lucide-react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { useMcpStore, findConnectionForServer } from "@/lib/stores/mcp-store";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, SimpleTooltip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ToolExecutionPanelProps {
  server: McpServer;
  tools: ToolInfo[];
  initialToolName?: string | null;
}

interface ToolCallResult {
  success: boolean;
  message: string;
  tool_name?: string;
  server_name?: string;
  result?: unknown;
  error?: string;
}

interface SavedPreset {
  id: string;
  toolName: string;
  presetName: string;
  fieldValues: Record<string, any>;
  skippedFields: Record<string, boolean>;
}

interface SessionRun {
  id: string;
  toolName: string;
  timestamp: string;
  createdAt: string;
  input: Record<string, any>;
  result: any;
  success: boolean;
  error?: string;
}

export default function ToolExecutionPanel({
  server,
  tools,
  initialToolName,
}: ToolExecutionPanelProps) {
  // Tabs: 'tools', 'sessions', 'resources', or 'templates'
  const [activePanelTab, setActivePanelTab] = useState<"tools" | "sessions" | "resources" | "templates">("tools");
  
  // View mode inside Tools: 'form', 'saved', or 'list' (if no selected tool)
  const [toolsViewMode, setToolsViewMode] = useState<"form" | "saved">("form");

  const [selectedToolName, setSelectedToolName] = useState<string>(
    initialToolName || tools[0]?.name || ""
  );

  const [result, setResult] = useState<ToolCallResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  
  // Form States
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [skippedFields, setSkippedFields] = useState<Record<string, boolean>>({});

  // Accordion Expand/Collapse States
  const [descExpanded, setDescExpanded] = useState(false);
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const [paramsExpanded, setParamsExpanded] = useState(true);

  // Saved Presets & History States
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionRun[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const isRestoringRef = useRef(false);

  const { theme } = useTheme();
  const tool = tools.find((t) => t.name === selectedToolName);

  const connections = useMcpStore((s) => s.connections);
  const stored = useMemo(
    () => findConnectionForServer(connections, server),
    [connections, server]
  );
  const sessionId = stored?.sessionId;

  const resources = stored?.resources ?? server.resources ?? [];
  const resourceTemplates = stored?.resourceTemplates ?? [];
  const prompts = stored?.prompts ?? server.prompts ?? [];

  // Resource / Template view states
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const [resourceContents, setResourceContents] = useState<
    Record<string, { text?: string; mimeType?: string }>
  >({});
  const [loadingResource, setLoadingResource] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateContent, setTemplateContent] = useState<{
    text?: string;
    mimeType?: string;
  } | null>(null);

  // Load Saved Presets & Sessions History on mount or server change
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const storedPresets = localStorage.getItem(`mcp-saved-presets-${server.id}`);
        if (storedPresets) setSavedPresets(JSON.parse(storedPresets));
        else setSavedPresets([]);

        const storedHistory = localStorage.getItem(`mcp-session-history-${server.id}`);
        if (storedHistory) {
          const parsed: SessionRun[] = JSON.parse(storedHistory);
          const cutoff = Date.now() - 86_400_000;
          const valid = parsed.filter((run) => {
            if (!run.createdAt) return false;
            return new Date(run.createdAt).getTime() > cutoff;
          });
          if (valid.length !== parsed.length) {
            localStorage.setItem(`mcp-session-history-${server.id}`, JSON.stringify(valid));
          }
          setSessionHistory(valid);
        } else {
          setSessionHistory([]);
        }
      } catch { }
    }
  }, [server.id]);

  // Sync initialToolName changes
  useEffect(() => {
    if (initialToolName) {
      setSelectedToolName(initialToolName);
      setToolsViewMode("form");
      setResult(null);
      setShowResult(false);
    }
  }, [initialToolName]);

  const parseSchema = (schema: unknown) => {
    if (!schema) return null;
    if (typeof schema === "object" && schema !== null) {
      return schema;
    }
    if (typeof schema === "string") {
      try {
        return JSON.parse(schema);
      } catch {
        return null;
      }
    }
    return null;
  };

  const inputSchema = tool ? parseSchema(tool.inputSchema) : null;
  const outputSchema = tool ? parseSchema(tool.outputSchema) : null;
  const schemaProperties = inputSchema?.properties || {};
  const requiredFields = inputSchema?.required || [];

  // Reset form fields when selected tool changes
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    if (!tool) return;
    const initialValues: Record<string, any> = {};
    const initialSkips: Record<string, boolean> = {};

    Object.entries(schemaProperties).forEach(([key, prop]: [string, any]) => {
      const isRequired = requiredFields.includes(key);
      initialSkips[key] = !isRequired; // Skip optional fields by default

      if (prop.default !== undefined) {
        initialValues[key] = prop.default;
      } else if (prop.type === "boolean") {
        initialValues[key] = false;
      } else if (prop.type === "array") {
        initialValues[key] = [];
      } else if (prop.type === "object") {
        initialValues[key] = {};
      } else if (prop.type === "integer" || prop.type === "number") {
        initialValues[key] = "";
      } else {
        initialValues[key] = "";
      }
    });

    setFieldValues(initialValues);
    setSkippedFields(initialSkips);
    setResult(null);
    setShowResult(false);
    setDescExpanded(false);
    setSchemaExpanded(false);
    setParamsExpanded(true);
  }, [selectedToolName, tool]);

  const handleToolChange = (toolName: string) => {
    setSelectedToolName(toolName);
    setToolsViewMode("form");
  };

  // Convert current form values to JSON payload
  const buildPayload = () => {
    const payload: Record<string, any> = {};
    Object.entries(schemaProperties).forEach(([key, prop]: [string, any]) => {
      if (skippedFields[key]) return; // Omit if skipped

      const val = fieldValues[key];
      if (val === "" || val === undefined) return;

      if (prop.type === "integer" || prop.type === "number") {
        const parsed = Number(val);
        if (!isNaN(parsed)) {
          payload[key] = parsed;
        }
      } else if (prop.type === "boolean") {
        payload[key] = Boolean(val);
      } else if (prop.type === "object" || prop.type === "array") {
        if (typeof val === "string") {
          try {
            payload[key] = JSON.parse(val);
          } catch {
            payload[key] = val; // fallback
          }
        } else {
          payload[key] = val;
        }
      } else {
        payload[key] = val;
      }
    });
    return payload;
  };

  // Form Change helper
  const handleFieldChange = (key: string, value: any) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    // Automatically uncheck skip when field is modified
    if (skippedFields[key]) {
      setSkippedFields((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCall = async () => {
    if (!tool) {
      toast.error("No tool selected");
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    const toolInput = buildPayload();

    try {
      if (!sessionId) {
        toast.error("Not connected to this server");
        setIsSubmitting(false);
        return;
      }

      const mcpActions = useMcpStore.getState().mcpActions;

      if (!mcpActions) {
        toast.error("Please sign in first.");
        setIsSubmitting(false);
        return;
      }

      const res = await mcpActions.callTool(sessionId, tool.name, toolInput);

      toast.success("Tool executed successfully");

      const successResult: ToolCallResult = {
        success: true,
        message: "Tool executed successfully",
        result: res,
      };

      setResult(successResult);
      setShowResult(true);

      // Save to Session History
      const newRun: SessionRun = {
        id: Math.random().toString(36).substring(7),
        toolName: tool.name,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        createdAt: new Date().toISOString(),
        input: toolInput,
        result: res,
        success: true,
      };
      const updatedHistory = [newRun, ...sessionHistory].slice(0, 50); // limit to 50 runs
      setSessionHistory(updatedHistory);
      localStorage.setItem(`mcp-session-history-${server.id}`, JSON.stringify(updatedHistory));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to call tool";
      toast.error(errorMessage);

      const failedResult: ToolCallResult = {
        success: false,
        message: errorMessage,
        error: errorMessage,
      };

      setResult(failedResult);
      setShowResult(true);

      // Save to Session History (failure)
      const newRun: SessionRun = {
        id: Math.random().toString(36).substring(7),
        toolName: tool.name,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        createdAt: new Date().toISOString(),
        input: toolInput,
        result: null,
        success: false,
        error: errorMessage,
      };
      const updatedHistory = [newRun, ...sessionHistory].slice(0, 50);
      setSessionHistory(updatedHistory);
      localStorage.setItem(`mcp-session-history-${server.id}`, JSON.stringify(updatedHistory));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset inputs
  const handleResetInputs = () => {
    if (!tool) return;
    const initialValues: Record<string, any> = {};
    const initialSkips: Record<string, boolean> = {};

    Object.entries(schemaProperties).forEach(([key, prop]: [string, any]) => {
      const isRequired = requiredFields.includes(key);
      initialSkips[key] = !isRequired;

      if (prop.default !== undefined) {
        initialValues[key] = prop.default;
      } else {
        initialValues[key] = "";
      }
    });

    setFieldValues(initialValues);
    setSkippedFields(initialSkips);
    setResult(null);
    setShowResult(false);
    toast.success("Inputs reset to default");
  };

  // Save current preset
  const handleSavePreset = () => {
    if (!tool) return;
    setNewPresetName(`${tool.name} preset`);
    setSavePresetDialogOpen(true);
  };

  // Load preset
  const handleLoadPreset = (preset: SavedPreset) => {
    isRestoringRef.current = true;
    setSelectedToolName(preset.toolName);
    setFieldValues(preset.fieldValues);
    setSkippedFields(preset.skippedFields);
    setToolsViewMode("form");
    toast.success(`Preset "${preset.presetName}" loaded`);
  };

  // Delete preset
  const handleDeletePreset = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem(`mcp-saved-presets-${server.id}`, JSON.stringify(updated));
    toast.success("Preset deleted");
  };

  // Delete run log
  const handleDeleteRunLog = (id: string) => {
    const updated = sessionHistory.filter((h) => h.id !== id);
    setSessionHistory(updated);
    localStorage.setItem(`mcp-session-history-${server.id}`, JSON.stringify(updated));
    toast.success("Run history item deleted");
  };

  const mcpActions = useMcpStore((s) => s.mcpActions);

  const handleReadResource = async (uri: string) => {
    if (loadingResource === uri) return;
    if (expandedResource === uri) {
      setExpandedResource(null);
      return;
    }
    setLoadingResource(uri);
    try {
      if (!sessionId || !mcpActions?.readResource) return;
      const result = await mcpActions.readResource(sessionId, uri);
      const contents = (result as any)?.contents;
      if (contents?.[0]) {
        setResourceContents((prev) => ({
          ...prev,
          [uri]: { text: contents[0].text, mimeType: contents[0].mimeType },
        }));
      }
      setExpandedResource(uri);
    } catch {
      setResourceContents((prev) => ({
        ...prev,
        [uri]: { text: "Failed to read resource" },
      }));
      setExpandedResource(uri);
    } finally {
      setLoadingResource(null);
    }
  };

  const extractTemplateVars = useMemo(
    () => (uriTemplate: string): string[] => {
      const vars: string[] = [];
      const regex = /\{([^}]+)\}/g;
      let match;
      while ((match = regex.exec(uriTemplate)) !== null) {
        vars.push(match[1]);
      }
      return vars;
    },
    []
  );

  const substituteTemplate = useMemo(
    () =>
      (uriTemplate: string, params: Record<string, string>): string =>
        uriTemplate.replace(/\{([^}]+)\}/g, (_, key) => params[key] || `{${key}}`),
    []
  );

  const handleReadTemplate = async (uriTemplate: string) => {
    if (templateLoading) return;
    setTemplateLoading(true);
    setTemplateContent(null);
    try {
      const uri = substituteTemplate(uriTemplate, templateParams);
      if (!sessionId || !mcpActions?.readResource) return;
      const result = await mcpActions.readResource(sessionId, uri);
      const contents = (result as any)?.contents;
      setTemplateContent({
        text: contents?.[0]?.text ?? "(empty)",
        mimeType: contents?.[0]?.mimeType,
      });
    } catch {
      setTemplateContent({ text: "Failed to read resource" });
    } finally {
      setTemplateLoading(false);
    }
  };

  // Filter tools based on search query
  const filteredTools = useMemo(() => {
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tools, searchQuery]);

  return (
    <div className="h-full flex flex-col bg-background select-none">
      {/* Top Tab Bar Header */}
      <div className="flex-shrink-0 flex items-center border-b border-border bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-1 bg-transparent p-0.5">
          <button
            onClick={() => {
              setActivePanelTab("tools");
              setToolsViewMode("form");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activePanelTab === "tools"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Hammer className="h-3.5 w-3.5" />
            Tools
            <span className="text-[10px] opacity-75 font-mono">({tools.length})</span>
          </button>
          <button
            onClick={() => setActivePanelTab("resources")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activePanelTab === "resources"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            Resources
          </button>
          <button
            onClick={() => setActivePanelTab("templates")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activePanelTab === "templates"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Boxes className="h-3.5 w-3.5" />
            Templates
          </button>
        </div>
      </div>

      {activePanelTab === "tools" ? (
        <>
          {/* Subheader Toolbar */}
          <div className="flex-shrink-0 border-b border-border px-4 py-2 flex items-center justify-between bg-background/50">
            <div className="flex items-center gap-2">
              <SimpleTooltip content={toolsViewMode === "saved" ? "Back to tool execution" : "View saved presets"} side="bottom">
                <button
                  onClick={() => setToolsViewMode(toolsViewMode === "saved" ? "form" : "saved")}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1.5 transition-colors ${
                    toolsViewMode === "saved"
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  aria-label={toolsViewMode === "saved" ? "Back to tool execution" : "View saved presets"}
                >
                  <Bookmark className="h-3 w-3" />
                  Saved
                  {savedPresets.length > 0 && (
                    <span className="text-[10px] opacity-75 font-mono">{savedPresets.length}</span>
                  )}
                </button>
              </SimpleTooltip>

              <SimpleTooltip content="View session history" side="bottom">
                <button
                  onClick={() => setActivePanelTab("sessions")}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  aria-label="View session history"
                >
                  <History className="h-3 w-3" />
                  Sessions
                </button>
              </SimpleTooltip>
            </div>

            {/* Quick Action Tools and Run Button */}
            {tool && toolsViewMode === "form" && (
              <div className="flex items-center gap-2.5">
                {/* Save Current Values Presets */}
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button
                      aria-label="Save current inputs as preset"
                      onClick={handleSavePreset}
                      className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer border border-transparent hover:border-border"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Save current inputs
                  </TooltipContent>
                </Tooltip>

                {/* Reset Form inputs */}
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button
                      aria-label="Reset form inputs to default"
                      onClick={handleResetInputs}
                      className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer border border-transparent hover:border-border"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Reset inputs
                  </TooltipContent>
                </Tooltip>

                {/* Primary RUN button */}
                <Button
                  onClick={handleCall}
                  disabled={isSubmitting}
                  className="bg-red-500 hover:bg-red-600 text-white flex items-center gap-1 px-3 py-1 h-7 text-xs font-semibold rounded cursor-pointer shadow-xs transition-colors"
                >
                  {isSubmitting ? (
                    <Loader className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3 fill-current" />
                  )}
                  {isSubmitting ? "Running" : "Run"}
                </Button>
              </div>
            )}
          </div>

          {/* Tools Inner Content */}
          <div className="flex-1 overflow-y-auto scrollbar-minimal">
            {toolsViewMode === "saved" ? (
              /* Presets view */
              <div className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Saved Input Presets</h3>
                {savedPresets.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-border rounded-lg bg-muted/10">
                    <p className="text-xs text-muted-foreground">No saved presets yet.</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">Configure inputs and click the save diskette icon above.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {savedPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between p-3 border border-border bg-card rounded-lg hover:shadow-xs transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{preset.presetName}</p>
                          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{preset.toolName}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleLoadPreset(preset)}
                            className="cursor-pointer"
                          >
                            Load
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDeletePreset(preset.id)}
                            className="text-destructive hover:bg-destructive/10 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : !tool ? (
              /* Tool browser / list view if no tool selected */
              <div className="p-4 space-y-4">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search tools..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 border border-border rounded-md bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">Available Tools ({filteredTools.length})</h3>
                  {filteredTools.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs text-muted-foreground">No tools found</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1">
                      {filteredTools.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => handleToolChange(t.name)}
                          className="w-full flex flex-col text-left p-2.5 rounded-lg hover:bg-muted/60 transition-colors border border-transparent hover:border-border/30 group"
                        >
                          <span className="text-xs font-mono font-semibold text-foreground transition-colors">{t.name}</span>
                          <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{t.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Main Tool runner Form */
              <div className="flex flex-col h-full min-h-0">
                {/* Tool Breadcrumb Navigation */}
                <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-muted/10 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <button
                    aria-label="Back to tools"
                    onClick={() => setSelectedToolName("")}
                    className="hover:text-foreground hover:bg-muted/80 p-0.5 rounded transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <span className="font-mono font-medium text-foreground select-text">{tool.name}</span>
                </div>

                <div className="flex-1 p-4 space-y-4">
                  {/* Collapsible Section: Description */}
                  <div className="border-b border-border py-1">
                    <button
                      aria-expanded={descExpanded}
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="w-full flex items-center justify-between py-2 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Description</span>
                      {descExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {descExpanded && (
                      <div className="pb-3 pt-1 text-xs text-muted-foreground leading-relaxed select-text">
                        {tool.description || "No description provided."}
                      </div>
                    )}
                  </div>

                  {/* Collapsible Section: Input Schema */}
                  <div className="border-b border-border py-1">
                    <button
                      aria-expanded={schemaExpanded}
                      onClick={() => setSchemaExpanded(!schemaExpanded)}
                      className="w-full flex items-center justify-between py-2 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Input Schema</span>
                      {schemaExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {schemaExpanded && inputSchema && (
                      <div className="pb-3 pt-1 max-h-48 overflow-y-auto w-full select-text">
                        <SyntaxHighlighter
                          language="json"
                          style={atomOneDark}
                          customStyle={{
                            margin: 0,
                            padding: "10px",
                            fontSize: "10.5px",
                            borderRadius: 0,
                          }}
                          wrapLongLines={true}
                        >
                          {JSON.stringify(inputSchema, null, 2)}
                        </SyntaxHighlighter>
                      </div>
                    )}
                  </div>

                  {/* Collapsible Section: Parameters Form Builder */}
                  <div className="border-b border-border py-1">
                    <button
                      aria-expanded={paramsExpanded}
                      onClick={() => setParamsExpanded(!paramsExpanded)}
                      className="w-full flex items-center justify-between py-2 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Parameters</span>
                      {paramsExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {paramsExpanded && (
                      <div className="pb-3 pt-1 space-y-4">
                        {Object.keys(schemaProperties).length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 italic">This tool takes no parameters.</p>
                        ) : (
                          Object.entries(schemaProperties).map(([key, prop]: [string, any]) => {
                            const isRequired = requiredFields.includes(key);
                            const isSkipped = skippedFields[key];

                            return (
                              <div
                                key={key}
                                className={`space-y-1.5 transition-opacity ${
                                  isSkipped ? "opacity-45" : "opacity-100"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <label className="text-xs font-mono font-bold text-foreground select-text truncate">
                                      {key}
                                    </label>
                                    {isRequired && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded border border-border bg-muted/60 text-muted-foreground font-bold tracking-wide">
                                        required
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Skip option (only for optional fields) */}
                                  {!isRequired && (
                                    <div className="flex items-center gap-1">
                                      <Checkbox
                                        id={`skip-${key}`}
                                        checked={!!isSkipped}
                                        onCheckedChange={(checked) => {
                                          setSkippedFields((prev) => ({
                                            ...prev,
                                            [key]: Boolean(checked),
                                          }));
                                        }}
                                        className="h-3.5 w-3.5 text-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 cursor-pointer"
                                      />
                                      <label
                                        htmlFor={`skip-${key}`}
                                        className="text-[10px] text-muted-foreground cursor-pointer select-none font-medium"
                                      >
                                        skip
                                      </label>
                                    </div>
                                  )}
                                </div>

                                {prop.description && (
                                  <p className="text-[11px] text-muted-foreground leading-snug select-text">
                                    {prop.description}
                                  </p>
                                )}

                                {/* Input control */}
                                {prop.type === "boolean" ? (
                                  <div className="pt-1.5">
                                    <Checkbox
                                      id={`field-${key}`}
                                      checked={Boolean(fieldValues[key])}
                                      disabled={isSkipped}
                                      onCheckedChange={(checked) => {
                                        handleFieldChange(key, Boolean(checked));
                                      }}
                                      className="cursor-pointer"
                                    />
                                  </div>
                                ) : prop.enum ? (
                                  <Select
                                    value={fieldValues[key] || ""}
                                    onValueChange={(val) => handleFieldChange(key, val)}
                                    disabled={isSkipped}
                                  >
                                    <SelectTrigger size="sm" className="w-full bg-background border-border text-xs">
                                      <SelectValue placeholder="Select value..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {prop.enum.map((option: string) => (
                                        <SelectItem key={option} value={option}>
                                          {option}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : prop.type === "object" || prop.type === "array" ? (
                                  <textarea
                                    value={typeof fieldValues[key] === "object" ? JSON.stringify(fieldValues[key], null, 2) : fieldValues[key] || ""}
                                    disabled={isSkipped}
                                    onChange={(e) => handleFieldChange(key, e.target.value)}
                                    placeholder={prop.type === "array" ? "[\n  \"value\"\n]" : "{\n  \"key\": \"value\"\n}"}
                                    className="w-full font-mono text-[11px] h-20 p-2 border border-border bg-background/50 rounded-md focus:outline-hidden focus:ring-1 focus:ring-ring resize-none select-text"
                                  />
                                ) : (
                                  <input
                                    type={prop.type === "integer" || prop.type === "number" ? "number" : "text"}
                                    value={fieldValues[key] || ""}
                                    disabled={isSkipped}
                                    onChange={(e) => handleFieldChange(key, e.target.value)}
                                    placeholder={`Enter ${key}`}
                                    className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring select-text"
                                  />
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Results Pane */}
                  {showResult && result && (
                    <div className="space-y-2 select-text">
                      <label className="text-xs font-semibold text-foreground">Result</label>
                      {result.success ? (
                        <Alert className="border-green-200 bg-green-50/70 dark:bg-green-950/20 dark:border-green-900/50 py-2.5">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-800 dark:text-green-200 text-xs">
                            {result.message}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="border-red-200 bg-red-50/70 dark:bg-red-950/20 dark:border-red-900/50 py-2.5">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-800 dark:text-red-200 text-xs leading-normal">
                            {result.message}
                            {result.error && (
                              <div className="text-[10px] font-mono mt-1 text-red-700 dark:text-red-400 break-words max-h-24 overflow-y-auto">
                                {result.error}
                              </div>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}

                      {result.result !== undefined && result.result !== null && (
                        <div className="mt-2 rounded-lg border border-border overflow-hidden select-text">
                          <div className="bg-muted/40 px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase border-b border-border/50">Response JSON</div>
                          <div className="max-h-80 overflow-y-auto scrollbar-minimal w-full">
                            <SyntaxHighlighter
                              language="json"
                              style={atomOneDark}
                              customStyle={{
                                margin: 0,
                                padding: "10px",
                                fontSize: "10.5px",
                              }}
                              wrapLongLines={true}
                            >
                              {typeof result.result === "string"
                                ? (result.result as string)
                                : JSON.stringify(result.result, null, 2)}
                            </SyntaxHighlighter>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : activePanelTab === "sessions" ? (
        /* Sessions execution history */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-minimal">
          <h3 className="text-sm font-semibold text-foreground">Execution History</h3>
          {sessionHistory.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-lg bg-muted/10">
              <p className="text-xs text-muted-foreground">No recent tool runs in this session.</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Select a tool, fill in parameters, and click Run.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessionHistory.map((run) => (
                <HistoryLogCollapseItem
                  key={run.id}
                  run={run}
                  onDelete={() => handleDeleteRunLog(run.id)}
                  onRestore={() => {
                    isRestoringRef.current = true;
                    setSelectedToolName(run.toolName);
                    // Build fieldValues and skips
                    const vals: Record<string, any> = {};
                    const skips: Record<string, boolean> = {};
                    
                    // First set defaults
                    const toolInfo = tools.find((t) => t.name === run.toolName);
                    const schema = toolInfo ? parseSchema(toolInfo.inputSchema) : null;
                    const props = schema?.properties || {};
                    const reqs = schema?.required || [];
                    
                    Object.keys(props).forEach((k) => {
                      skips[k] = !reqs.includes(k);
                    });

                    // Load run inputs
                    Object.entries(run.input).forEach(([k, v]) => {
                      vals[k] = typeof v === "object" ? JSON.stringify(v, null, 2) : v;
                      skips[k] = false;
                    });
                    
                    setFieldValues(vals);
                    setSkippedFields(skips);
                    setActivePanelTab("tools");
                    setToolsViewMode("form");
                    toast.success("Inputs restored from history");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : activePanelTab === "resources" ? (
        /* Resources */
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-minimal">
          <h3 className="text-sm font-semibold text-foreground">Resources</h3>
          {resources.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-lg bg-muted/10">
              <p className="text-xs text-muted-foreground">No resources available</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                Connect to a server that exposes resources to browse and read them here.
              </p>
            </div>
          ) : (
            resources.map((resource) => {
              const isExpanded = expandedResource === resource.uri;
              const content = resourceContents[resource.uri];
              const isLoading = loadingResource === resource.uri;
              return (
                <div key={resource.uri} className="border border-border rounded-lg bg-card overflow-hidden">
                  <button
                    onClick={() => handleReadResource(resource.uri)}
                    className="w-full text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <code className="text-xs font-mono font-semibold text-foreground truncate">{resource.name}</code>
                      <div className="flex items-center gap-2 shrink-0">
                        {resource.mimeType && (
                          <span className="text-[10px] text-muted-foreground font-mono">{resource.mimeType}</span>
                        )}
                        {isLoading ? (
                          <Loader className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                        )}
                      </div>
                    </div>
                    {resource.description && (
                      <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">{resource.description}</p>
                    )}
                    <div className="text-[10px] text-muted-foreground font-mono truncate">{resource.uri}</div>
                  </button>
                  {isExpanded && content && (
                    <div className="border-t border-border/50 bg-muted/10 p-3 select-text">
                      {content.mimeType && (
                        <div className="text-[10px] text-muted-foreground font-mono mb-2">{content.mimeType}</div>
                      )}
                      <pre className="text-[11px] whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">
                        {content.text || "(binary content)"}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Resource Templates */
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-minimal">
          <h3 className="text-sm font-semibold text-foreground">Resource Templates</h3>
          {resourceTemplates.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-lg bg-muted/10">
              <p className="text-xs text-muted-foreground">No resource templates available</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                Templates allow parameterized resource URIs — fill in the variables and read them here.
              </p>
            </div>
          ) : (
            resourceTemplates.map((template) => {
              const vars = extractTemplateVars(template.uriTemplate);
              const isExpanded = expandedTemplate === template.uriTemplate;
              return (
                <div key={template.uriTemplate} className="border border-border rounded-lg bg-card overflow-hidden">
                  <button
                    onClick={() => {
                      const next = isExpanded ? null : template.uriTemplate;
                      setExpandedTemplate(next);
                      setTemplateContent(null);
                    }}
                    className="w-full text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <code className="text-xs font-mono font-semibold text-foreground truncate">{template.name}</code>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
                    </div>
                    {template.description && (
                      <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">{template.description}</p>
                    )}
                    <div className="text-[10px] text-muted-foreground font-mono">{template.uriTemplate}</div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/50 p-3 space-y-2.5">
                      {vars.length > 0 ? (
                        vars.map((v) => (
                          <div key={v}>
                            <label className="text-[10px] font-mono text-muted-foreground block mb-1">{v}</label>
                            <input
                              value={templateParams[v] || ""}
                              onChange={(e) => setTemplateParams((p) => ({ ...p, [v]: e.target.value }))}
                              placeholder={`Enter ${v}`}
                              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring select-text"
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">No variables in this template.</p>
                      )}
                      {vars.length > 0 && (
                        <Button
                          size="sm"
                          onClick={() => handleReadTemplate(template.uriTemplate)}
                          disabled={templateLoading || vars.some((v) => !templateParams[v])}
                          className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white cursor-pointer"
                        >
                          {templateLoading ? <Loader className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
                          {templateLoading ? "Reading..." : "Read"}
                        </Button>
                      )}
                      {templateContent && (
                        <div className="rounded-md bg-muted/40 border border-border/40 p-3 select-text">
                          {templateContent.mimeType && (
                            <div className="text-[10px] text-muted-foreground font-mono mb-2">{templateContent.mimeType}</div>
                          )}
                          <pre className="text-[11px] whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">
                            {templateContent.text}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <Dialog open={savePresetDialogOpen} onOpenChange={setSavePresetDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Input Preset</DialogTitle>
            <DialogDescription>
              Enter a name for this preset to save your current parameter inputs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-xs font-semibold">
                Preset Name
              </label>
              <input
                id="name"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g. Test Jam parameters"
                className="w-full px-3 py-2 border border-border bg-background rounded-md text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSavePresetDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => {
                if (!newPresetName.trim()) {
                  toast.error("Preset name cannot be empty");
                  return;
                }
                const newPreset: SavedPreset = {
                  id: Math.random().toString(36).substring(7),
                  toolName: tool?.name || "",
                  presetName: newPresetName.trim(),
                  fieldValues,
                  skippedFields,
                };

                const updatedPresets = [...savedPresets, newPreset];
                setSavedPresets(updatedPresets);
                localStorage.setItem(`mcp-saved-presets-${server.id}`, JSON.stringify(updatedPresets));
                toast.success("Preset saved successfully");
                setSavePresetDialogOpen(false);
              }}
            >
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Subcomponent to handle individual session log collapse/expand state
function HistoryLogCollapseItem({
  run,
  onRestore,
  onDelete,
}: {
  run: SessionRun;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden transition-shadow hover:shadow-xs">
      <div className="flex items-center justify-between p-3 select-none">
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 flex items-center gap-2.5 cursor-pointer"
        >
          {run.success ? (
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono font-semibold text-foreground truncate">{run.toolName}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{run.timestamp}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 ml-4">
          <Button variant="outline" size="xs" onClick={onRestore} className="cursor-pointer text-[10px] h-6">
            Load Inputs
          </Button>
          <button
            aria-label={expanded ? "Collapse run details" : "Expand run details"}
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete run history item"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 cursor-pointer h-6 w-6"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-muted/10 p-3 space-y-3 text-xs select-text">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Inputs:</p>
            <div className="rounded-md border border-border/60 max-h-40 overflow-y-auto">
              <SyntaxHighlighter
                language="json"
                style={atomOneDark}
                customStyle={{ margin: 0, padding: "8px", fontSize: "10px" }}
                wrapLongLines={true}
              >
                {JSON.stringify(run.input, null, 2)}
              </SyntaxHighlighter>
            </div>
          </div>

          {run.result && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Output:</p>
              <div className="rounded-md border border-border/60 max-h-40 overflow-y-auto">
                <SyntaxHighlighter
                  language="json"
                  style={atomOneDark}
                  customStyle={{ margin: 0, padding: "8px", fontSize: "10px" }}
                  wrapLongLines={true}
                >
                  {JSON.stringify(run.result, null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {run.error && (
            <div>
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Error:</p>
              <pre className="p-2 border border-rose-200/40 bg-rose-500/5 text-rose-600 dark:text-rose-400 font-mono text-[10px] rounded-md overflow-x-auto whitespace-pre-wrap select-text">
                {run.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

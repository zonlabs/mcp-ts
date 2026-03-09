"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToolInfo, McpServer } from "@/types/mcp";
import { toast } from "react-hot-toast";
import { AlertCircle, CheckCircle, Loader, X, ChevronDown } from "lucide-react";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { motion, AnimatePresence } from "framer-motion";
import { useMcpStore } from "@/lib/stores/mcp-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ToolExecutionPanelProps {
  server: McpServer;
  tools: ToolInfo[];
  onClose: () => void;
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

export default function ToolExecutionPanel({
  server,
  tools,
  onClose,
  initialToolName
}: ToolExecutionPanelProps) {
  const [selectedToolName, setSelectedToolName] = useState<string>(
    initialToolName || tools[0]?.name || ""
  );
  const [inputJson, setInputJson] = useState("{}");
  const [result, setResult] = useState<ToolCallResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const { theme } = useTheme();

  const tool = tools.find(t => t.name === selectedToolName);

  const handleToolChange = (toolName: string) => {
    setSelectedToolName(toolName);
    setInputJson("{}");
    setResult(null);
    setShowResult(false);
  };

  const parseSchema = (schema: unknown) => {
    if (!schema) return null;
    if (typeof schema === 'object' && schema !== null) {
      return schema;
    }
    if (typeof schema === 'string') {
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

  // Helper function to escape Windows paths in JSON strings
  const fixWindowsPaths = (jsonString: string): string => {
    try {
      // Try to parse first - if it works, no need to fix
      JSON.parse(jsonString);
      return jsonString;
    } catch {
      // Replace unescaped backslashes with escaped ones
      // This regex looks for backslashes that aren't already escaped
      const fixed = jsonString.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return fixed;
    }
  };

  const handleCall = async () => {
    if (!tool) {
      toast.error("No tool selected");
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      // Validate JSON input
      let toolInput: Record<string, unknown>;
      try {
        toolInput = JSON.parse(inputJson);
      } catch (parseError) {
        // Try to auto-fix Windows paths
        try {
          const fixedJson = fixWindowsPaths(inputJson);
          toolInput = JSON.parse(fixedJson);
          // Update the input with the fixed version
          setInputJson(fixedJson);
          toast.success("Auto-fixed Windows paths in JSON");
        } catch {
          toast.error(
            "Invalid JSON. For Windows paths, use either:\n" +
            '• Double backslashes: "C:\\\\Users\\\\file.txt"\n' +
            '• Forward slashes: "C:/Users/file.txt"'
          );
          setIsSubmitting(false);
          return;
        }
      }

      // Get sessionId from store
      const connection =
        useMcpStore.getState().getConnectionByServerId(server.id) ||
        (server.url ? useMcpStore.getState().getConnectionByServerId(server.url) : undefined);
      const sessionId = connection?.sessionId;

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

      const result = await mcpActions.callTool(sessionId, tool.name, toolInput);

      toast.success("Tool executed successfully");

      setResult({
        success: true,
        message: "Tool executed successfully",
        result: result
      });
      setShowResult(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to call tool";
      toast.error(errorMessage);
      setResult({
        success: false,
        message: errorMessage,
        error: errorMessage
      });
      setShowResult(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setInputJson("{}");
    setResult(null);
    setShowResult(false);
    onClose();
  };

  // Generate example input based on schema
  const generateExampleInput = () => {
    if (!tool) return;
    const example: Record<string, unknown> = {};
    Object.entries(schemaProperties).forEach(([key, prop]) => {
      const propObj = prop as Record<string, unknown>;
      if (propObj.type === 'string') {
        example[key] = `example_${key}`;
      } else if (propObj.type === 'number' || propObj.type === 'integer') {
        example[key] = 0;
      } else if (propObj.type === 'boolean') {
        example[key] = true;
      } else if (propObj.type === 'array') {
        example[key] = [];
      } else {
        example[key] = null;
      }
    });
    setInputJson(JSON.stringify(example, null, 2));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 320 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 320 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col bg-background"
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        {/* Top Bar - Server Info and Close Button */}
        <div className="p-4 pb-0 flex items-center justify-between gap-3">
          {/* <div className="flex-1 min-w-0 flex items-center gap-2"> */}
          {/* <p className="text-xs text-muted-foreground uppercase tracking-wide flex-shrink-0">Server:</p> */}
          <h2 className="text-sm font-semibold text-foreground truncate">{server.name}</h2>
          {/* </div> */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0 hover:bg-muted cursor-pointer flex-shrink-0"
            title="Close tool tester"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tool Selector Section */}
        <div className="p-4 pt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2 uppercase tracking-wide">Select Tool</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between cursor-pointer text-sm font-medium"
                >
                  {tool?.name || "Choose a tool..."}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {tools.map((t) => (
                  <DropdownMenuItem
                    key={t.name}
                    onClick={() => handleToolChange(t.name)}
                    className="cursor-pointer"
                  >
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Tool Details */}
          {tool && (
            <div className="space-y-1 bg-muted/40 rounded-md p-3 border border-border/50">
              <h3 className="font-semibold text-sm text-foreground">{tool.name}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {tool.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        <div className="p-4 space-y-4">
          {!tool ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No tool selected</p>
            </div>
          ) : (
            <>
              {/* Input Schema */}
              {inputSchema && (
                <div>
                  <label className="text-sm font-medium">Input Schema</label>
                  <div className="mt-2 max-h-40 overflow-y-auto overflow-x-hidden rounded-md border border-slate-700 scrollbar-minimal">
                    <SyntaxHighlighter
                      language="json"
                      style={atomOneDark}
                      customStyle={{
                        margin: 0,
                        padding: '12px',
                        fontSize: '11px',
                        borderRadius: '6px'
                      }}
                      wrapLongLines={true}
                    >
                      {JSON.stringify(inputSchema, null, 2)}
                    </SyntaxHighlighter>
                  </div>
                  {Object.keys(schemaProperties).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateExampleInput}
                      className="mt-2 cursor-pointer w-full"
                    >
                      Generate Example Input
                    </Button>
                  )}
                </div>
              )}

              {/* Output Schema */}
              {outputSchema && (
                <div>
                  <label className="text-sm font-medium">Output Schema</label>
                  <div className="mt-2 max-h-40 overflow-y-auto overflow-x-hidden rounded-md border border-slate-700 scrollbar-minimal">
                    <SyntaxHighlighter
                      language="json"
                      style={atomOneDark}
                      customStyle={{
                        margin: 0,
                        padding: '12px',
                        fontSize: '11px',
                        borderRadius: '6px'
                      }}
                      wrapLongLines={true}
                    >
                      {JSON.stringify(outputSchema, null, 2)}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )}

              {/* Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Tool Input (JSON)</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const fixed = fixWindowsPaths(inputJson);
                      if (fixed !== inputJson) {
                        setInputJson(fixed);
                        toast.success("Windows paths escaped");
                      } else {
                        toast("No paths to fix");
                      }
                    }}
                    className="h-7 text-xs cursor-pointer"
                    title="Automatically escape Windows backslashes in paths"
                  >
                    Fix Paths
                  </Button>
                </div>
                <textarea
                  value={inputJson}
                  onChange={(e) => setInputJson(e.target.value)}
                  placeholder='{"key": "value"}'
                  className={`w-full font-mono text-xs h-24 p-3 rounded-md border focus:outline-none focus:ring-2 resize-none overflow-x-hidden scrollbar-minimal ${theme === 'dark'
                    ? 'border-slate-700 bg-slate-900 text-gray-200 placeholder:text-gray-600 focus:ring-slate-600'
                    : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-500 focus:ring-slate-400'
                    }`}
                />
              </div>

              {/* Result - Only show when there's a result */}
              <AnimatePresence>
                {showResult && result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <label className="text-sm font-medium">Result</label>
                    {result.success ? (
                      <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-700">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800 dark:text-green-200">
                          {result.message}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-red-800 dark:text-red-200">
                          {result.message}
                          {result.error && <div className="text-xs mt-2">{result.error}</div>}
                        </AlertDescription>
                      </Alert>
                    )}

                    {result.result ? (
                      <div className="mt-2 rounded-md border border-slate-700 w-full min-w-0 overflow-hidden">
                        <p className="text-xs font-semibold text-gray-300 dark:text-gray-400 px-3 pt-3">Response:</p>
                        <div className="max-h-96 overflow-x-auto overflow-y-auto scrollbar-minimal w-2xl">
                          <SyntaxHighlighter
                            language="json"
                            style={atomOneDark}
                            customStyle={{
                              margin: 0,
                              padding: '12px',
                              fontSize: '11px',
                              whiteSpace: 'pre',
                              minWidth: 'min-content'
                            }}
                          >
                            {typeof result.result === 'string'
                              ? result.result
                              : JSON.stringify(result.result, null, 2)}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      {/* Footer - Actions */}
      {tool && (
        <div className="flex-shrink-0 p-4 border-t border-border space-y-2">
          <Button
            onClick={handleCall}
            disabled={isSubmitting}
            className="w-full cursor-pointer"
          >
            {isSubmitting && <Loader className="h-4 w-4 mr-2 animate-spin" />}
            {isSubmitting ? "Calling..." : "Call Tool"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}

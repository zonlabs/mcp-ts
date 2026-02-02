"use client";

import {
  useRenderToolCall,
  type ActionRenderPropsNoArgs,
} from "@copilotkit/react-core";
import { useMcpContext } from "./mcp/mcp-provider";
import type React from "react";
import { MCPToolCall } from "./mcp-tool-call";
import { McpAppTool } from "./mcp/tools/McpAppTool";
import { useMcpEvents } from "./mcp/mcp-events-provider";
import { ToolInfo } from "@mcp-ts/sdk/shared";

type RenderProps = ActionRenderPropsNoArgs<[]> & { name?: string };

// Helper to check for UI capability and extract URI
function getToolUiResourceUri(tool: ToolInfo): string | undefined {
  const meta = (tool as any)._meta;
  if (!meta?.ui) return undefined;

  // Validate schema structurally similar to McpUiToolMetaSchema
  const ui = meta.ui;
  if (typeof ui !== "object" || !ui) return undefined;

  // Check strict visibility
  if (ui.visibility && !ui.visibility.includes("app")) return undefined;

  // Extract URI
  const uri = ui.uri;
  return typeof uri === "string" ? uri : undefined;
}

const defaultRender: React.ComponentType<RenderProps> = (props: RenderProps) => {
  const { name = "", status, args, result } = props;
  const toolStatus = (status === "complete" || status === "inProgress" || status === "executing")
    ? status
    : "executing";

  // Check for MCP App UI event (backend event)
  const { events } = useMcpEvents();
  const appEvent = events[name];

  // Access MCP Context to check for local tool metadata
  const { mcpClient } = useMcpContext();

  // Try to find local app definition if no backend event yet
  let localAppConfig: { resourceUri: string, sessionId: string } | undefined;

  // We need to iterate over all connections to find which one has this tool
  // This is a bit inefficient but safe given typical tool counts
  if (!appEvent) {
    for (const conn of mcpClient.connections) {
      const tool = conn.tools.find(t => t.name === name);
      if (tool) {
        const uri = getToolUiResourceUri(tool);
        if (uri) {
          localAppConfig = {
            resourceUri: uri,
            sessionId: conn.sessionId
          };
          break;
        }
      }
    }
  }

  // Prioritize backend event if available (single source of truth for runtime),
  // but fallback to local config for instant load
  const activeApp = appEvent || localAppConfig;

  if (activeApp) {
    return (
      <div className="flex flex-col gap-2">
        <MCPToolCall status={toolStatus} name={name} args={args} result={result} />
        <McpAppTool resourceUri={activeApp.resourceUri} sessionId={activeApp.sessionId} />
      </div>
    );
  }

  return <MCPToolCall status={toolStatus} name={name} args={args} result={result} />;
};

export function ToolRenderer() {

  useRenderToolCall({
    name: "*",
    render: defaultRender as (props: ActionRenderPropsNoArgs<[]>) => React.ReactElement,
  });

  return null;
}

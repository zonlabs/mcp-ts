"use client";

import {
  useRenderToolCall,
  type ActionRenderPropsNoArgs,
} from "@copilotkit/react-core";
import React, { useMemo } from "react";
import { useMcpContext } from "./mcp/mcp-provider";
import { MCPToolCall } from "./mcp-tool-call";
import { McpAppTool } from "./mcp/tools/McpAppTool";
import { useMcpEvents } from "./mcp/mcp-events-provider";
import { ToolInfo } from "@mcp-ts/sdk/shared";

type RenderProps = ActionRenderPropsNoArgs<[]> & { name?: string };

function getToolUiResourceUri(tool: ToolInfo): string | undefined {
  const meta = (tool as any)._meta;
  if (!meta?.ui) return undefined;

  const ui = meta.ui;
  if (typeof ui !== "object" || !ui) return undefined;
  if (ui.visibility && !ui.visibility.includes("app")) return undefined;

  // Support both 'uri' and 'resourceUri' field names
  return typeof ui.resourceUri === "string" ? ui.resourceUri
    : typeof ui.uri === "string" ? ui.uri
    : undefined;
}

const defaultRender: React.FC<RenderProps> = (props) => {
  const { name = "", status, args, result } = props;

  const toolStatus =
    status === "complete" || status === "inProgress" || status === "executing"
      ? status
      : "executing";

  const { mcpClient } = useMcpContext();
  const { events } = useMcpEvents();

  const localAppConfig = useMemo(() => {
    for (const conn of mcpClient.connections) {
      const tool = conn.tools.find((t) => t.name === name);
      if (!tool) continue;

      const uri = getToolUiResourceUri(tool);
      if (uri) {
        return {
          resourceUri: uri,
          sessionId: conn.sessionId,
        };
      }
    }
    return undefined;
  }, [mcpClient.connections, name]);

  // Prioritize local metadata over events for instant loading
  // Local config is available synchronously from tool discovery,
  // while events require async round-trip through the agent
  const appEvent = events[name];
  const activeApp = localAppConfig ?? appEvent;

  return (
    <div className="flex flex-col gap-2">
      <MCPToolCall
        status={toolStatus}
        name={name}
        args={args}
        result={result}
      />
      {activeApp && (
        <McpAppTool
          resourceUri={activeApp.resourceUri}
          sessionId={activeApp.sessionId}
        />
      )}
    </div>
  );
};

export function ToolRenderer() {
  useRenderToolCall({
    name: "*",
    render: defaultRender as (
      props: ActionRenderPropsNoArgs<[]>
    ) => React.ReactElement,
  });

  return null;
}

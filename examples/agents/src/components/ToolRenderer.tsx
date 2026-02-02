"use client";

import {
  useRenderToolCall,
  type ActionRenderPropsNoArgs,
} from "@copilotkit/react-core";
import type React from "react";
import { MCPToolCall } from "./mcp-tool-call";
import { McpAppTool } from "./mcp/tools/McpAppTool";
import { useMcpContext } from "./mcp/mcp-provider";

type RenderProps = ActionRenderPropsNoArgs<[]> & { name?: string };

const defaultRender: React.ComponentType<RenderProps> = (props: RenderProps) => {
  const { name = "", status, args, result } = props;
  const toolStatus = (status === "complete" || status === "inProgress" || status === "executing")
    ? status
    : "executing";

  // Check for MCP App UI in result metadata
  const meta = (result as any)?._meta;
  const uiUri = meta?.ui?.resourceUri || meta?.['ui/resourceUri'];

  // Infer session from the tool name since the result doesn't explicitly contain it.
  const { mcpClient } = useMcpContext();
  const connection = mcpClient.connections.find(c => c.tools.some(t => t.name === name));

  if (uiUri && connection) {
    return (
      <div className="flex flex-col gap-2">
        <MCPToolCall status={toolStatus} name={name} args={args} result={result} />
        <McpAppTool resourceUri={uiUri} sessionId={connection.sessionId} />
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
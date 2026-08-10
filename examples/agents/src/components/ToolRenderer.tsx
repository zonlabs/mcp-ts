"use client";

import { useRenderToolCall, type ActionRenderPropsNoArgs } from "@copilotkit/react-core";
import { useMcpApps, DEFAULT_MCP_APP_CSP } from "@mcp-ts/sdk/client/react";
import { useMcpContext } from "./mcp";
import { MCPToolCall } from "./mcp-tool-call";

type RenderProps = ActionRenderPropsNoArgs<[]> & { name?: string };

const ToolCallRenderer: React.FC<RenderProps> = (props) => {
  const { name = "", args, result, status } = props;
  const { mcpClient } = useMcpContext();
  const { McpAppRenderer } = useMcpApps(mcpClient);

  // Normalize status
  const normalizedStatus = status === "complete" || status === "inProgress" || status === "executing" 
    ? status 
    : "executing";

  return (
    <>
      <MCPToolCall 
        name={name}
        args={args} 
        result={result} 
        status={normalizedStatus} 
      />
      <McpAppRenderer
        name={name}
        input={args}
        result={result}
        status={normalizedStatus}
        sandbox={{
          url: '/sandbox.html',
          csp: DEFAULT_MCP_APP_CSP,
        }}
      />
    </>
  );
};

export function ToolRenderer() {
  useRenderToolCall({
    name: "*",
    render: ToolCallRenderer as (props: ActionRenderPropsNoArgs<[]>) => React.ReactElement,
  });

  return null;
}

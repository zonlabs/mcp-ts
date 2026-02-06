"use client";

import { useRenderToolCall, type ActionRenderPropsNoArgs } from "@copilotkit/react-core";
import { useAgent } from "@copilotkit/react-core/v2";
import { useMcpApps } from "@mcp-ts/sdk/client/react";
import { useMcpContext } from "./mcp/mcp-provider";
import { MCPToolCall } from "./mcp-tool-call";
import { McpAppTool } from "./mcp/tools/McpAppTool";

type RenderProps = ActionRenderPropsNoArgs<[]> & { name?: string };

const defaultRender: React.FC<RenderProps> = (props) => {
  const { name = "", status, args, result } = props;
  const { mcpClient } = useMcpContext();
  const { agent } = useAgent({ agentId: "mcpAssistant" });

  // useMcpApps handles both metadata and events, and automatically handles
  // both base names (e.g., "get-time") and prefixed names (e.g., "tool_abc123_get-time")
  const { apps } = useMcpApps(agent, mcpClient);

  const toolStatus =
    status === "complete" || status === "inProgress" || status === "executing"
      ? status
      : "executing";

  // Look up app by tool name - works with both base and prefixed formats!
  const app = apps[name];
  console.log("Rendering tool call:", { name, status, args, result, app });
  console.log("Available apps:", Object.keys(apps));
  return (
    <div className="flex flex-col gap-2">
      <MCPToolCall status={toolStatus} name={name} args={args} result={result} />
      {app && mcpClient.sseClient && app.sessionId && (
        <McpAppTool
          app={app}
          toolInput={args}
          toolResult={result}
          toolStatus={toolStatus}
        />
      )}
    </div>
  );
};

export function ToolRenderer() {
  useRenderToolCall({
    name: "*",
    render: defaultRender as (props: ActionRenderPropsNoArgs<[]>) => React.ReactElement,
  });

  return null;
}

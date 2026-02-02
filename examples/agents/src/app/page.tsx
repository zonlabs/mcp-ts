"use client";

import { useAgent } from "@copilotkit/react-core/v2";
import { CopilotChat, CopilotKitCSSProperties } from "@copilotkit/react-ui";
import { McpSidebar } from "@/components/mcp";
import { ToolRenderer } from "@/components/ToolRenderer";
import { McpProvider } from "@/components/mcp/mcp-provider";
import { useEffect } from "react";
import type { AgentSubscriber } from "@ag-ui/client";

const darkTheme: CopilotKitCSSProperties = {
  "--copilot-kit-primary-color": "#444444",
  "--copilot-kit-contrast-color": "#ffffff",
  "--copilot-kit-background-color": "#0a0a0a",
  "--copilot-kit-input-background-color": "#2b2b2b",
  "--copilot-kit-secondary-color": "#3f3f46",
  "--copilot-kit-secondary-contrast-color": "#fafafa",
  "--copilot-kit-separator-color": "#3f3f46",
  "--copilot-kit-muted-color": "#a1a1aa",
};

function CopilotKitPageContent() {
  // Get agent instance from CopilotKit
  const { agent } = useAgent(
    {
      agentId: "mcpAssistant",
    }
  );

  /**
   * Subscribe to agent events to capture mcp-apps-ui custom events
   */
  useEffect(() => {
    console.log("[Page] Setting up agent subscriber for MCP App events");
    if (!agent) return;
    console.log("[Page] Agent ready");

    const subscriber: AgentSubscriber = {
      onCustomEvent: ({ event }) => {
        // ToolRenderer now handles mcp-apps-ui via tool result metadata
      },
      onRunStartedEvent: () => {
        console.log("[Page] Agent started running");
      },
      onRunFinalized: () => {
        console.log("[Page] Agent finished running");
      },
      onStateChanged: (state) => {
        console.log("[Page] State changed:", state);
      },
    };

    const { unsubscribe } = agent.subscribe(subscriber);
    return () => unsubscribe();
  }, [agent]);

  return (
    <main className="h-screen flex" style={darkTheme}>
      <aside className="w-80 shrink-0">
        <McpSidebar />
      </aside>
      <div className="flex-1 min-w-0 max-w-4xl mx-auto flex flex-col h-full">
        <ToolRenderer />

        <div className="flex-1 bg-gray-900 border-t border-gray-700">
          <CopilotChat
            className="h-full"
            disableSystemMessage={true}
            labels={{
              title: "MCP Assistant",
              initial: "Hi!, How can I help you today?",
            }}
          />
        </div>
      </div>
    </main>
  );
}

export default function CopilotKitPage() {
  return (
    <McpProvider url="/api/mcp" identity="demo-user-123">
      <CopilotKitPageContent />
    </McpProvider>
  );
}

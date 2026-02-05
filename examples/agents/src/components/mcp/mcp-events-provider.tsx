"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAgent } from "@copilotkit/react-core/v2";
import type { AgentSubscriber } from "@ag-ui/client";

export interface McpAppEvent {
    resourceUri: string;
    sessionId: string;
    toolName: string;
}

interface McpEventsContextType {
    events: Record<string, McpAppEvent>;
}

const McpEventsContext = createContext<McpEventsContextType | null>(null);

export function McpEventsProvider({ children }: { children: ReactNode }) {
    const [events, setEvents] = useState<Record<string, McpAppEvent>>({});

    // Connect to the agent to listen for events
    const { agent } = useAgent({ agentId: "mcpAssistant" });

    useEffect(() => {
        if (!agent) return;

        const subscriber: AgentSubscriber = {
            onCustomEvent: ({ event }) => {
                // Listen for "mcp-apps-ui" events which contain the launch parameters
                if (event.name === "mcp-apps-ui") {
                    const val = event.value as any;
                    if (val && val.toolName) {
                        console.log("[McpEvents] Received UI event for tool:", val.toolName);
                        setEvents(prev => ({
                            ...prev,
                            [val.toolName]: val
                        }));
                    }
                }
            },
            onRunStartedEvent: () => { },
            onRunFinalized: () => { },
            onStateChanged: () => { },
        };

        const { unsubscribe } = agent.subscribe(subscriber);
        return () => unsubscribe();
    }, [agent]);

    return <McpEventsContext.Provider value={{ events }}>{children}</McpEventsContext.Provider>;
}

export function useMcpEvents() {
    return useContext(McpEventsContext) || { events: {} };
}

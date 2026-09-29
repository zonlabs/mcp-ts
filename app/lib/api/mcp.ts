import { apiClient } from "./client";

export const mcpApi = {
  /**
   * Delete MCP usage and telemetry events.
   */
  deleteUsageEvents: () =>
    apiClient<{ success?: boolean }>("/api/remote-mcp/usage", {
      method: "DELETE",
    }),

  /**
   * Post a client-side MCP tool call analytics event.
   */
  recordEvent: (eventData: {
    server_id?: string;
    server_name?: string;
    tool_name: string;
    execution_source: "agent" | "manual" | "system";
    status: "success" | "error";
    duration_ms: number;
    input_payload?: unknown;
    error_message?: string;
  }) =>
    apiClient<{ success: boolean }>("/api/mcp/events", {
      method: "POST",
      body: JSON.stringify(eventData),
    }),
};

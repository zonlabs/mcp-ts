"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  normalizeAgentId,
  normalizeCapabilities,
  normalizeGatewayServerInfo,
  readGatewaySelectionsFromStorage,
  selectionKey,
  writeGatewaySelectionsToStorage,
  type GatewayServerInfo,
  type GatewayServerSelection,
  type RemoteAgent,
} from "@/lib/gateway-access";

export function useGatewaySelections() {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [serverInfoMap, setServerInfoMap] = useState<Record<string, GatewayServerInfo>>({});
  const [enabledSelectionKeys, setEnabledSelectionKeys] = useState<string[]>([]);
  const [loadingGatewayServers, setLoadingGatewayServers] = useState(false);
  const [gatewayLoadError, setGatewayLoadError] = useState<string | null>(null);

  const detectedSelections = useMemo(() => {
    const selections: GatewayServerSelection[] = [];
    for (const agent of agents) {
      const agentId = normalizeAgentId(agent);
      if (!agentId) continue;
      for (const mcpServer of normalizeCapabilities(agent)) {
        selections.push({ agentId, mcpServer });
      }
    }
    return selections;
  }, [agents]);

  const detectedSelectionKeySet = useMemo(
    () => new Set(detectedSelections.map(selectionKey)),
    [detectedSelections]
  );

  const enabledDetectedCount = useMemo(
    () => enabledSelectionKeys.filter((key) => detectedSelectionKeySet.has(key)).length,
    [enabledSelectionKeys, detectedSelectionKeySet]
  );

  const persistSelections = useCallback((keys: string[]) => {
    const selections = keys
      .map((key) => {
        const [agentId, mcpServer] = key.split("::");
        if (!agentId || !mcpServer) return null;
        return { agentId, mcpServer } satisfies GatewayServerSelection;
      })
      .filter((value): value is GatewayServerSelection => Boolean(value));

    writeGatewaySelectionsToStorage(selections);
    setEnabledSelectionKeys(keys);
  }, []);

  const fetchGatewayServers = useCallback(async () => {
    setLoadingGatewayServers(true);
    setGatewayLoadError(null);
    try {
      const agentsResponse = await fetch("/api/remote-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "agents" }),
      });
      const agentsData = await agentsResponse.json();
      if (!agentsResponse.ok) {
        throw new Error(agentsData?.error || "Failed to fetch gateway agents");
      }

      const nextAgents = Array.isArray(agentsData?.agents) ? (agentsData.agents as RemoteAgent[]) : [];
      setAgents(nextAgents);

      const pairs: Array<{ agentId: string; mcpServer: string; key: string }> = [];
      for (const agent of nextAgents) {
        const agentId = normalizeAgentId(agent);
        if (!agentId) continue;
        for (const mcpServer of normalizeCapabilities(agent)) {
          pairs.push({ agentId, mcpServer, key: `${agentId}::${mcpServer}` });
        }
      }

      if (pairs.length === 0) {
        setServerInfoMap({});
        return;
      }

      const details = await Promise.all(
        pairs.map(async ({ agentId, mcpServer, key }) => {
          try {
            const response = await fetch("/api/remote-bridge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "server-info",
                agentId,
                mcpServer,
              }),
            });
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data?.error || "Failed to inspect server");
            }
            return [key, normalizeGatewayServerInfo(data.data, agentId, mcpServer)] as const;
          } catch (error) {
            return [
              key,
              {
                status: "error",
                agent_id: agentId,
                mcp_server: mcpServer,
                title: "",
                version: "",
                instructions: error instanceof Error ? error.message : "Failed to inspect server",
                tools_count: 0,
                tools: [],
              } as GatewayServerInfo,
            ] as const;
          }
        })
      );

      const nextInfoMap: Record<string, GatewayServerInfo> = {};
      for (const [key, info] of details) {
        nextInfoMap[key] = info;
      }
      setServerInfoMap(nextInfoMap);
    } catch (error) {
      setAgents([]);
      setServerInfoMap({});
      setGatewayLoadError(error instanceof Error ? error.message : "Failed to load local MCP servers");
    } finally {
      setLoadingGatewayServers(false);
    }
  }, []);

  useEffect(() => {
    const storedSelections = readGatewaySelectionsFromStorage();
    setEnabledSelectionKeys(storedSelections.map(selectionKey));
    void fetchGatewayServers();
  }, [fetchGatewayServers]);

  return {
    detectedSelections,
    enabledSelectionKeys,
    enabledDetectedCount,
    loadingGatewayServers,
    serverInfoMap,
    gatewayLoadError,
    persistSelections,
    fetchGatewayServers,
  };
}

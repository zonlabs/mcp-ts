export { connectRemote, RemoteToolClient } from "./client.js";
export {
  benchmarkStrategies,
  createRouter,
  generateWrappers,
  resolveTool,
  searchTools,
  type SearchResult,
  type StrategyBenchmark
} from "./core.js";
export { estimateTextTokens, estimateToolTokens, estimateToolsTokens } from "./token-estimator.js";
export { McpGatewayRegistry, canonicalToolId } from "./gateway/registry.js";
export {
  LocalHttpMcp,
  isSearchDiscoveryMode,
  type LocalHttpMcpOptions,
  type LocalMcpDiscoveryMode,
} from "./gateway/local-http-mcp.js";
export { RemoteBridgeClient, type RemoteBridgeClientOptions } from "./gateway/bridge-client.js";
export {
  findMcpJson,
  loadMcpJson,
  writeDefaultMcpJson,
  addOrUpdateServerConfig,
  removeServerConfig,
  enableServerConfig,
  disableServerConfig,
  toggleServerConfig,
  type LoadedConfig
} from "./gateway/config.js";
export {
  pingGateway,
  withMcpGateway,
  getServerConfig,
  type GatewayContextOptions,
} from "./gateway/context.js";
export type { AggregatedTool } from "./gateway/registry.js";
export { McpConfigWatcher, type McpConfigWatcherOptions } from "./gateway/watcher.js";
export {
  spawnDaemon,
  stopDaemon,
  getDaemonStatus,
  readDaemonLogs,
  isProcessAlive,
  getCliBinPath,
  type DaemonInfo,
  type DaemonStatus,
} from "./gateway/daemon.js";
export * from "./constants.js";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { McpServerConfig, McpServersConfig } from "./types.js";
import { CONFIG_FILENAME, DEFAULT_CONFIG_DIR } from "../constants.js";

export { CONFIG_FILENAME, DEFAULT_CONFIG_DIR };

export interface LoadedConfig {
  path: string;
  config: McpServersConfig;
}

/**
 * Locate mcp.json by searching upward from `startDir` (or via MCP_CONFIG_PATH).
 */
export function findMcpJson(startDir: string = process.cwd()): string | null {
  const explicit = process.env.MCP_CONFIG_PATH;
  if (explicit) {
    return existsSync(explicit) ? resolve(explicit) : null;
  }
  let dir = resolve(startDir);
  for (;;) {
    for (const candidate of [join(dir, CONFIG_FILENAME), join(dir, DEFAULT_CONFIG_DIR, CONFIG_FILENAME)]) {
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadMcpJson(startDir: string = process.cwd()): LoadedConfig {
  const path = findMcpJson(startDir);
  if (!path) {
    throw new Error(
      `No ${CONFIG_FILENAME} found. Create one or run "mcp-ts init".`,
    );
  }
  let raw: McpServersConfig;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as McpServersConfig;
  } catch {
    throw new Error(`${path} is empty or not valid JSON.`);
  }
  return { path, config: raw };
}

const DEFAULT_MCP_JSON: McpServersConfig = {
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    },
  },
};

export function writeDefaultMcpJson(dir: string): string {
  const targetDir = join(resolve(dir), DEFAULT_CONFIG_DIR);
  mkdirSync(targetDir, { recursive: true });
  const path = join(targetDir, CONFIG_FILENAME);
  writeFileSync(path, JSON.stringify(DEFAULT_MCP_JSON, null, 2));
  return path;
}

/**
 * Add or update an MCP server configuration in mcp.json (or .mcpassistant/mcp.json).
 */
export function addOrUpdateServerConfig(
  name: string,
  serverConfig: McpServerConfig,
  startDir: string = process.cwd(),
): { path: string } {
  let existingPath = findMcpJson(startDir);
  let configData: McpServersConfig;

  if (existingPath) {
    try {
      configData = JSON.parse(readFileSync(existingPath, "utf8")) as McpServersConfig;
      if (!configData.mcpServers || typeof configData.mcpServers !== "object") {
        configData.mcpServers = {};
      }
    } catch {
      configData = { mcpServers: {} };
    }
  } else {
    const targetDir = join(resolve(startDir), DEFAULT_CONFIG_DIR);
    mkdirSync(targetDir, { recursive: true });
    existingPath = join(targetDir, CONFIG_FILENAME);
    configData = { mcpServers: {} };
  }

  configData.mcpServers[name] = serverConfig;
  writeFileSync(existingPath, JSON.stringify(configData, null, 2));
  return { path: existingPath };
}

/**
 * Remove an MCP server configuration from mcp.json (or .mcpassistant/mcp.json).
 */
export function removeServerConfig(
  name: string,
  startDir: string = process.cwd(),
): { path: string; removed: boolean; serverConfig?: McpServerConfig } {
  const existingPath = findMcpJson(startDir);
  if (!existingPath) {
    throw new Error(`No ${CONFIG_FILENAME} found.`);
  }

  let configData: McpServersConfig;
  try {
    configData = JSON.parse(readFileSync(existingPath, "utf8")) as McpServersConfig;
  } catch {
    throw new Error(`${existingPath} is empty or not valid JSON.`);
  }

  if (!configData.mcpServers || !(name in configData.mcpServers)) {
    return { path: existingPath, removed: false };
  }

  const serverConfig = configData.mcpServers[name];
  delete configData.mcpServers[name];
  writeFileSync(existingPath, JSON.stringify(configData, null, 2));
  return { path: existingPath, removed: true, serverConfig };
}

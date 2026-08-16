#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { McpManager } from '../dist/server/index.mjs';
import {
  formatMarkdownReport,
  runToolCatalogScenario,
} from './toolrouter-efficiency.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(__dirname, 'results');
const fixturesDir = resolve(__dirname, 'fixtures');
const exampleNextDir = resolve(__dirname, '..', 'examples', 'next');
const DEFAULT_SEARCH_ITERATIONS = 1000;
const DEFAULT_WARMUP_ITERATIONS = 50;

export function parseEnvContent(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

export async function loadEnvFiles(paths) {
  const loaded = [];

  for (const path of paths) {
    try {
      const content = await readFile(path, 'utf8');
      const parsed = parseEnvContent(content);

      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      loaded.push(path);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return loaded;
}

function callIfFunction(context, value, fallback) {
  return typeof value === 'function' ? value.call(context) : fallback;
}

export async function collectToolsFromClients(clients) {
  const tools = [];
  const serverCounts = [];
  const errors = [];

  for (const client of clients) {
    if (typeof client.isConnected === 'function' && !client.isConnected()) {
      continue;
    }

    const serverName =
      callIfFunction(client, client.getServerName, undefined) ??
      callIfFunction(client, client.getServerId, undefined) ??
      'unknown';
    const serverId = callIfFunction(client, client.getServerId, undefined) ?? serverName;
    const sessionId = callIfFunction(client, client.getSessionId, undefined) ?? 'unknown';

    try {
      const result = await client.listTools();
      const listedTools = Array.isArray(result) ? result : result?.tools ?? [];

      for (const tool of listedTools) {
        tools.push({
          ...tool,
          serverName,
          serverId,
          sessionId,
        });
      }

      serverCounts.push({
        serverName,
        serverId,
        sessionId,
        toolCount: listedTools.length,
      });
    } catch (error) {
      errors.push({
        serverName,
        serverId,
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { tools, serverCounts, errors };
}

export function createFixture(catalog, options = {}) {
  const includeSchemas = options.includeSchemas === true;

  return {
    generatedAt: new Date().toISOString(),
    toolCount: catalog.tools.length,
    serverCounts: catalog.serverCounts,
    tools: catalog.tools.map((tool) => {
      const fixtureTool = {
        name: tool.name,
        description: tool.description,
        serverName: tool.serverName,
        serverId: tool.serverId,
        sessionId: tool.sessionId,
      };

      if (includeSchemas) {
        fixtureTool.inputSchema = tool.inputSchema;
      }

      return fixtureTool;
    }),
  };
}

function parseExpectedCounts(raw) {
  if (!raw) return [];

  return raw
    .split(',')
    .map((entry) => {
      const [name, count] = entry.split('=').map((part) => part.trim());
      return {
        serverName: name,
        expectedToolCount: Number(count),
      };
    })
    .filter((entry) => entry.serverName && Number.isFinite(entry.expectedToolCount));
}

function compareExpectedCounts(serverCounts, expectedCounts) {
  return expectedCounts.map((expected) => {
    const match = serverCounts.find((server) =>
      server.serverName.toLowerCase().includes(expected.serverName.toLowerCase()) ||
      server.serverId.toLowerCase().includes(expected.serverName.toLowerCase())
    );

    return {
      serverName: expected.serverName,
      expectedToolCount: expected.expectedToolCount,
      observedToolCount: match?.toolCount ?? 0,
      matchedServerName: match?.serverName,
      matchedServerId: match?.serverId,
      matches: (match?.toolCount ?? 0) === expected.expectedToolCount,
    };
  });
}

function formatLiveMarkdownReport(report) {
  const lines = [
    '# Live ToolRouter Efficiency Benchmark',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Environment',
    '',
    `- Node: ${report.environment.node}`,
    `- Platform: ${report.environment.platform}`,
    `- CPU: ${report.environment.cpu}`,
    `- Identity: ${redactIdentity(report.identity)}`,
    '',
    '## Live MCP Servers',
    '',
    '| Server | Server ID | Session | Tools |',
    '|---|---|---|---:|',
  ];

  for (const server of report.serverCounts) {
    lines.push(
      `| ${server.serverName} | ${server.serverId} | ${server.sessionId} | ${server.toolCount} |`
    );
  }

  if (report.expectedCounts.length > 0) {
    lines.push(
      '',
      '## Expected Count Check',
      '',
      '| Expected server | Expected tools | Observed tools | Matched server | Status |',
      '|---|---:|---:|---|---|'
    );

    for (const expected of report.expectedCounts) {
      lines.push(
        `| ${expected.serverName} ` +
        `| ${expected.expectedToolCount} ` +
        `| ${expected.observedToolCount} ` +
        `| ${expected.matchedServerName ?? 'not found'} ` +
        `| ${expected.matches ? 'pass' : 'check'} |`
      );
    }
  }

  if (report.errors.length > 0) {
    lines.push(
      '',
      '## Collection Errors',
      '',
      '| Server | Session | Error |',
      '|---|---|---|'
    );

    for (const error of report.errors) {
      lines.push(`| ${error.serverName} | ${error.sessionId} | ${error.message} |`);
    }
  }

  lines.push('', formatMarkdownReport({
    generatedAt: report.generatedAt,
    environment: report.environment,
    methodology: report.methodology,
    scenarios: report.scenarios,
  }).replace('# ToolRouter Efficiency Benchmark', '## ToolRouter Context Results'));

  return lines.join('\n');
}

function redactIdentity(identity) {
  if (!identity || identity.length <= 8) return identity ?? 'unknown';
  return `${identity.slice(0, 4)}...${identity.slice(-4)}`;
}

export async function runLiveBenchmark(options = {}) {
  if (options.loadEnv !== false) {
    await loadEnvFiles([
      resolve(exampleNextDir, '.env.local'),
      resolve(exampleNextDir, '.env'),
    ]);
  }

  const identity = options.identity ?? process.env.NEXT_PUBLIC_MCP_IDENTITY;

  if (!identity) {
    throw new Error('Missing NEXT_PUBLIC_MCP_IDENTITY. Set it before running the live benchmark.');
  }

  const client = options.client ?? new McpManager(identity, {
    timeout: Number(process.env.TOOLROUTER_LIVE_CONNECT_TIMEOUT_MS ?? 15000),
    maxRetries: Number(process.env.TOOLROUTER_LIVE_CONNECT_RETRIES ?? 2),
  });

  await client.connect();

  let catalog;
  let scenario;
  let expectedCounts;

  try {
    catalog = await collectToolsFromClients(client.getClients());
    const searchIterations = Number(
      options.searchIterations ??
      process.env.TOOLROUTER_BENCHMARK_ITERATIONS ??
      DEFAULT_SEARCH_ITERATIONS
    );
    const warmupIterations = Number(
      options.warmupIterations ??
      process.env.TOOLROUTER_BENCHMARK_WARMUP ??
      DEFAULT_WARMUP_ITERATIONS
    );
    scenario = await runToolCatalogScenario({
      label: 'live-mcp-catalog',
      tools: catalog.tools,
      searchIterations,
      warmupIterations,
    });
    expectedCounts = compareExpectedCounts(
      catalog.serverCounts,
      parseExpectedCounts(options.expectedCounts ?? process.env.TOOLROUTER_EXPECTED_SERVER_COUNTS)
    );
  } finally {
    client.disconnect();
  }

  return {
    generatedAt: new Date().toISOString(),
    identity,
    environment: {
      node: process.version,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model ?? 'unknown',
    },
    methodology:
      'Live benchmark against active MCP sessions loaded from the configured mcp-ts storage backend. ' +
      'The baseline loads every real tool inputSchema upfront. ToolRouter search mode loads four meta-tool schemas first, then includes top-5 discovery results and selected full schemas on demand.',
    serverCounts: catalog.serverCounts,
    expectedCounts,
    errors: catalog.errors,
    scenarios: [scenario],
    fixture: createFixture(catalog, {
      includeSchemas: process.env.TOOLROUTER_SAVE_LIVE_FIXTURE_SCHEMAS === '1',
    }),
  };
}

export async function writeLiveBenchmarkArtifacts(report) {
  await mkdir(resultsDir, { recursive: true });

  const jsonPath = resolve(resultsDir, 'live-latest.json');
  const markdownPath = resolve(resultsDir, 'live-report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, formatLiveMarkdownReport(report), 'utf8');

  const artifacts = { jsonPath, markdownPath };

  if (process.env.TOOLROUTER_SAVE_LIVE_FIXTURE === '1') {
    await mkdir(fixturesDir, { recursive: true });
    const fixturePath = resolve(fixturesDir, 'live-tool-catalog.json');
    await writeFile(fixturePath, `${JSON.stringify(report.fixture, null, 2)}\n`, 'utf8');
    artifacts.fixturePath = fixturePath;
  }

  return artifacts;
}

async function main() {
  const report = await runLiveBenchmark();
  const artifacts = await writeLiveBenchmarkArtifacts(report);
  const markdown = formatLiveMarkdownReport(report);

  console.log(markdown);
  console.log(`Artifacts written:\n- ${artifacts.jsonPath}\n- ${artifacts.markdownPath}`);
  if (artifacts.fixturePath) {
    console.log(`- ${artifacts.fixturePath}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

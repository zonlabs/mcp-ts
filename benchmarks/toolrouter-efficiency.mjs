#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import {
  ToolIndex,
  createExecuteToolDefinition,
  createGetSchemaToolDefinition,
  createRegexSearchToolDefinition,
  createSearchToolDefinition,
} from '../packages/client/dist/shared.mjs';
import { estimateToolTokens, estimateToolsTokens } from './token-estimator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(__dirname, 'results');
const DEFAULT_TOOL_COUNTS = [100, 500, 1000, 5000, 20000];
const DEFAULT_SEARCH_ITERATIONS = 1000;
const DEFAULT_WARMUP_ITERATIONS = 50;

const SEARCH_QUERIES = [
  'github repository pull request',
  'slack channel messages',
  'database query records',
  'resource identifier lookup',
  'search workflow query',
];

export function createSyntheticTools(toolCount) {
  const tools = [];
  const sessionCount = 25;
  const duplicatePool = 200;

  for (let i = 0; i < toolCount; i++) {
    const sessionIndex = i % sessionCount;
    const domain = i % 3 === 0 ? 'github' : i % 3 === 1 ? 'slack' : 'database';
    const duplicateName = `shared_tool_${i % duplicatePool}`;

    tools.push({
      name: duplicateName,
      description: `${domain} action for synthetic benchmark item ${i}`,
      inputSchema: {
        type: 'object',
        properties: {
          resourceId: {
            type: 'string',
            description: `${domain} resource identifier for item ${i}`,
          },
          query: {
            type: 'string',
            description: `search query for ${domain} workflow ${i}`,
          },
          limit: {
            type: 'number',
            description: 'max number of items to return',
          },
        },
        required: ['resourceId'],
      },
      serverId: `${domain}-server-${sessionIndex}`,
      serverName: `${domain}-server-${sessionIndex}`,
      sessionId: `session-${sessionIndex}`,
    });
  }

  return tools;
}

export function estimatePlainTextTokens(text) {
  return Math.ceil(String(text).length / 4);
}

export function calculateReductionPercent(fullTokens, routedTokens) {
  if (fullTokens <= 0) return 0;
  return Number((((fullTokens - routedTokens) / fullTokens) * 100).toFixed(4));
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((percentileValue / 100) * sorted.length)
  );
  return sorted[index] ?? 0;
}

function summarizeLatency(samples) {
  const total = samples.reduce((sum, value) => sum + value, 0);
  const average = samples.length > 0 ? total / samples.length : 0;

  return {
    avgMs: Number(average.toFixed(4)),
    p50Ms: Number(percentile(samples, 50).toFixed(4)),
    p95Ms: Number(percentile(samples, 95).toFixed(4)),
    p99Ms: Number(percentile(samples, 99).toFixed(4)),
  };
}

function getMetaToolTokens() {
  const metaTools = [
    createSearchToolDefinition(),
    createRegexSearchToolDefinition(),
    createGetSchemaToolDefinition(),
    createExecuteToolDefinition(),
  ];

  return estimateToolsTokens(metaTools);
}

function formatSearchResultText(results) {
  return results
    .map((tool, index) => {
      const serverId = tool.serverId ? `, serverId: ${tool.serverId}` : '';
      return `${index + 1}. ${tool.name} (server: ${tool.serverName}${serverId})\n` +
        `   ${tool.description}`;
    })
    .join('\n');
}

function getToolKey(tool) {
  return `${tool.sessionId ?? ''}::${tool.serverId ?? ''}::${tool.name}`;
}

function buildToolTokenIndex(tools) {
  const tokenIndex = new Map();

  for (const tool of tools) {
    tokenIndex.set(getToolKey(tool), estimateToolTokens(tool));
  }

  return tokenIndex;
}

function getSummaryTokenCost(summary, tokenIndex) {
  return tokenIndex.get(getToolKey(summary)) ?? 0;
}

export async function runScenario(options) {
  const toolCount = Number(options.toolCount);
  const tools = createSyntheticTools(toolCount);

  return runToolCatalogScenario({
    ...options,
    tools,
    toolCount,
    duplicateToolNamePool: 200,
    sessionCount: 25,
  });
}

export async function runToolCatalogScenario(options) {
  const tools = options.tools;
  const toolCount = Number(options.toolCount ?? tools.length);
  const searchIterations = Number(options.searchIterations ?? DEFAULT_SEARCH_ITERATIONS);
  const warmupIterations = Number(options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS);
  const index = new ToolIndex();

  const buildStart = performance.now();
  await index.buildIndex(tools);
  const buildMs = performance.now() - buildStart;
  const toolTokenIndex = buildToolTokenIndex(tools);

  for (let i = 0; i < warmupIterations; i++) {
    await index.search(SEARCH_QUERIES[i % SEARCH_QUERIES.length], 5);
  }

  const samples = [];
  let firstResults = [];

  for (let i = 0; i < searchIterations; i++) {
    const query = SEARCH_QUERIES[i % SEARCH_QUERIES.length];
    const searchStart = performance.now();
    const results = await index.search(query, 5);
    samples.push(performance.now() - searchStart);

    if (i === 0) {
      firstResults = results;
    }
  }

  const fullUpfrontTokens = estimateToolsTokens(tools);
  const toolRouterInitialTokens = getMetaToolTokens();
  const discoveryTokens =
    toolRouterInitialTokens + estimatePlainTextTokens(formatSearchResultText(firstResults));
  const selectedOneToolTokens = firstResults[0]
    ? getSummaryTokenCost(firstResults[0], toolTokenIndex)
    : 0;
  const selectedThreeToolTokens = firstResults
    .slice(0, 3)
    .reduce((sum, tool) => sum + getSummaryTokenCost(tool, toolTokenIndex), 0);
  const oneToolTaskTokens = discoveryTokens + selectedOneToolTokens;
  const threeToolTaskTokens = discoveryTokens + selectedThreeToolTokens;

  return {
    toolCount,
    ...(options.label ? { label: options.label } : {}),
    ...(options.duplicateToolNamePool ? { duplicateToolNamePool: options.duplicateToolNamePool } : {}),
    ...(options.sessionCount ? { sessionCount: options.sessionCount } : {}),
    searchIterations,
    warmupIterations,
    buildMs: Number(buildMs.toFixed(2)),
    fullUpfrontTokens,
    toolRouterInitialTokens,
    initialReductionPercent: calculateReductionPercent(
      fullUpfrontTokens,
      toolRouterInitialTokens
    ),
    routedTop5DiscoveryTokens: discoveryTokens,
    discoveryReductionPercent: calculateReductionPercent(fullUpfrontTokens, discoveryTokens),
    routedOneToolTaskTokens: oneToolTaskTokens,
    oneToolTaskReductionPercent: calculateReductionPercent(fullUpfrontTokens, oneToolTaskTokens),
    routedThreeToolTaskTokens: threeToolTaskTokens,
    threeToolTaskReductionPercent: calculateReductionPercent(
      fullUpfrontTokens,
      threeToolTaskTokens
    ),
    searchLatency: summarizeLatency(samples),
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`;
}

export function formatMarkdownReport(report) {
  const lines = [
    '# ToolRouter Efficiency Benchmark',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Environment',
    '',
    `- Node: ${report.environment.node}`,
    `- Platform: ${report.environment.platform}`,
    `- CPU: ${report.environment.cpu}`,
    '',
    '## Methodology',
    '',
    report.methodology,
    '',
    '## Context Efficiency',
    '',
    '| Tools | Load all upfront | ToolRouter initial | Initial reduction | 1-tool routed task | 1-tool task reduction | 3-tool routed task | 3-tool task reduction |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];

  for (const scenario of report.scenarios) {
    lines.push(
      `| ${formatNumber(scenario.toolCount)} ` +
      `| ${formatNumber(scenario.fullUpfrontTokens)} tokens ` +
      `| ${formatNumber(scenario.toolRouterInitialTokens)} tokens ` +
      `| ${formatPercent(scenario.initialReductionPercent)} ` +
      `| ${formatNumber(scenario.routedOneToolTaskTokens)} tokens ` +
      `| ${formatPercent(scenario.oneToolTaskReductionPercent)} ` +
      `| ${formatNumber(scenario.routedThreeToolTaskTokens)} tokens ` +
      `| ${formatPercent(scenario.threeToolTaskReductionPercent)} |`
    );
  }

  lines.push(
    '',
    '## Routing Latency',
    '',
    '| Tools | Index build | Avg search | p50 search | p95 search | p99 search |',
    '|---:|---:|---:|---:|---:|---:|'
  );

  for (const scenario of report.scenarios) {
    lines.push(
      `| ${formatNumber(scenario.toolCount)} ` +
      `| ${scenario.buildMs.toFixed(2)} ms ` +
      `| ${scenario.searchLatency.avgMs.toFixed(4)} ms ` +
      `| ${scenario.searchLatency.p50Ms.toFixed(4)} ms ` +
      `| ${scenario.searchLatency.p95Ms.toFixed(4)} ms ` +
      `| ${scenario.searchLatency.p99Ms.toFixed(4)} ms |`
    );
  }

  lines.push(
    '',
    '## Headline',
    '',
    headlineFor(report.scenarios),
    ''
  );

  return lines.join('\n');
}

function headlineFor(scenarios) {
  const fiveThousand = scenarios.find((scenario) => scenario.toolCount === 5000);
  const twentyThousand = scenarios.find((scenario) => scenario.toolCount === 20000);
  const preferred = twentyThousand ?? fiveThousand ?? scenarios[scenarios.length - 1];

  if (!preferred) {
    return 'No benchmark scenarios were run.';
  }

  return `At ${formatNumber(preferred.toolCount)} tools, ToolRouter reduced initial tool-schema context by ` +
    `${formatPercent(preferred.initialReductionPercent)} and still reduced context by ` +
    `${formatPercent(preferred.oneToolTaskReductionPercent)} after search plus one selected schema.`;
}

function parseToolCounts() {
  const raw = process.env.TOOLROUTER_BENCHMARK_COUNTS;
  if (!raw) return DEFAULT_TOOL_COUNTS;

  const parsed = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return parsed.length > 0 ? parsed : DEFAULT_TOOL_COUNTS;
}

export async function runBenchmark(options = {}) {
  const toolCounts = options.toolCounts ?? parseToolCounts();
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

  const scenarios = [];
  for (const toolCount of toolCounts) {
    scenarios.push(await runScenario({ toolCount, searchIterations, warmupIterations }));
  }

  return {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model ?? 'unknown',
    },
    methodology:
      'Synthetic MCP tool catalogs with duplicate tool names across 25 sessions. ' +
      'The baseline loads every full tool inputSchema upfront. ToolRouter search mode loads four meta-tool schemas first, then includes top-5 discovery results and selected full schemas on demand. ' +
      'Latency measurements include warmup iterations and report avg/p50/p95/p99 over repeated BM25 searches.',
    scenarios,
  };
}

export async function writeBenchmarkArtifacts(report) {
  await mkdir(resultsDir, { recursive: true });

  const jsonPath = resolve(resultsDir, 'latest.json');
  const markdownPath = resolve(resultsDir, 'report.md');

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, formatMarkdownReport(report), 'utf8');

  return { jsonPath, markdownPath };
}

async function main() {
  const report = await runBenchmark();
  const artifacts = await writeBenchmarkArtifacts(report);
  const markdown = formatMarkdownReport(report);

  console.log(markdown);
  console.log(`Artifacts written:\n- ${artifacts.jsonPath}\n- ${artifacts.markdownPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

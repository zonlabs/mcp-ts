import { test, expect } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { ToolIndex, type IndexedTool } from '../src/shared/tool-index';

function createSyntheticTools(toolCount: number): IndexedTool[] {
    const tools: IndexedTool[] = [];
    const sessionCount = 25;
    const duplicatePool = 200;

    for (let i = 0; i < toolCount; i++) {
        const sessionIndex = i % sessionCount;
        const domain = i % 3 === 0 ? 'github' : i % 3 === 1 ? 'slack' : 'database';
        const duplicateName = `shared_tool_${i % duplicatePool}`;

        tools.push({
            name: duplicateName,
            serverId: `server_${sessionIndex}`,
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
            serverName: `${domain}-server-${sessionIndex}`,
            sessionId: `session-${sessionIndex}`,
        });
    }

    return tools;
}

async function syntheticEmbedFn(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
        const vector = new Array<number>(16).fill(0);
        for (let i = 0; i < text.length; i++) {
            vector[i % vector.length] += text.charCodeAt(i);
        }
        const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
        return vector.map((value) => value / magnitude);
    });
}

async function measureIndexPerformance(
    toolCount: number,
    options?: ConstructorParameters<typeof ToolIndex>[0]
) {
    const tools = createSyntheticTools(toolCount);
    const index = new ToolIndex(options);

    const buildStart = performance.now();
    await index.buildIndex(tools);
    const buildMs = performance.now() - buildStart;

    const searchQueries = [
        'github pull request repository',
        'slack channel messages',
        'database query records',
        'resource identifier lookup',
        'search workflow query',
    ];

    const searchStart = performance.now();
    for (let i = 0; i < 100; i++) {
        await index.search(searchQueries[i % searchQueries.length], 10);
    }
    const searchMs = performance.now() - searchStart;

    const regexStart = performance.now();
    for (let i = 0; i < 100; i++) {
        index.searchRegex('(?i)shared_tool_1', 10);
    }
    const regexMs = performance.now() - regexStart;

    const sampleResults = await index.search('github repository', 10);

    return {
        datasetSize: tools.length,
        duplicateNames: 200,
        buildMs: Number(buildMs.toFixed(2)),
        avgSearchMs: Number((searchMs / 100).toFixed(4)),
        avgRegexMs: Number((regexMs / 100).toFixed(4)),
        sampleResultCount: sampleResults.length,
        topResult: sampleResults[0],
    };
}

function assertWithinBudget(
    result: {
        buildMs: number;
        avgSearchMs: number;
        avgRegexMs: number;
    },
    budget: {
        buildMs: number;
        avgSearchMs: number;
        avgRegexMs: number;
    }
) {
    expect(result.buildMs).toBeLessThan(budget.buildMs);
    expect(result.avgSearchMs).toBeLessThan(budget.avgSearchMs);
    expect(result.avgRegexMs).toBeLessThan(budget.avgRegexMs);
}

test.describe('ToolIndex performance', () => {
    test.skip(!process.env.RUN_PERF_TESTS, 'Set RUN_PERF_TESTS=1 to run benchmark-style perf checks.');

    test('benchmarks build and repeated search on a large duplicated tool set', async () => {
        const result = await measureIndexPerformance(5000);

        console.log(
            JSON.stringify(result, null, 2)
        );

        expect(result.sampleResultCount).toBeGreaterThan(0);
        assertWithinBudget(result, {
            buildMs: 1000,
            avgSearchMs: 5,
            avgRegexMs: 3,
        });
    });

    test('benchmarks larger scale behavior on a 20k duplicated tool set', async () => {
        const result = await measureIndexPerformance(20000);

        console.log(
            JSON.stringify(
                {
                    scenario: '20k-scale',
                    ...result,
                },
                null,
                2
            )
        );

        expect(result.sampleResultCount).toBeGreaterThan(0);
        assertWithinBudget(result, {
            buildMs: 3000,
            avgSearchMs: 5,
            avgRegexMs: 3,
        });
    });

    test('benchmarks embedding-enabled search path with deterministic local embeddings', async () => {
        const result = await measureIndexPerformance(5000, {
            embedFn: syntheticEmbedFn,
            keywordWeight: 0.4,
        });

        console.log(
            JSON.stringify(
                {
                    scenario: '5k-with-embeddings',
                    ...result,
                },
                null,
                2
            )
        );

        expect(result.sampleResultCount).toBeGreaterThan(0);
        assertWithinBudget(result, {
            buildMs: 1000,
            avgSearchMs: 5,
            avgRegexMs: 3,
        });
    });
});

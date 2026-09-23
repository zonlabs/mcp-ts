import { ToolLoopAgent, tool, stepCountIs, type ToolSet } from 'ai';
import { z } from 'zod';
import { createProjectFileTools } from '@/lib/projects/file-tools';
import { getModelConfig, type LlmConfig } from '@/lib/llm';

export interface CreateFileAnalystToolOptions {
  projectId: string;
  llmConfig?: LlmConfig;
}

/**
 * Creates the `inspect_project_knowledge` tool backed by an isolated child ToolLoopAgent.
 *
 * This subagent is tasked with searching, reading, and extracting information from
 * project files (code, schemas, markdown, PDFs, etc.). Because it executes inside
 * its own subagent loop, large raw file contents NEVER pollute the parent orchestrator's
 * conversation context. Only the concise synthesis is returned.
 */
export function createFileAnalystTool({ projectId, llmConfig }: CreateFileAnalystToolOptions) {
  return {
    inspect_project_knowledge: tool({
      description:
        'Search, inspect, and analyze documents, code, schemas, and knowledge files attached to the current project. Uses a dedicated file research subagent to read files, extract specific data, and return a concise synthesis without cluttering the main conversation.',
      inputSchema: z.object({
        task: z
          .string()
          .describe(
            'Clear instruction on what knowledge or files to inspect and what specific information to extract or answer.'
          ),
        filenames: z
          .array(z.string())
          .optional()
          .describe('Optional list of specific filenames to inspect if known (e.g., ["schema.sql", "api.md"]).'),
      }),
      execute: async ({ task, filenames }) => {
        try {
          const fileTools = createProjectFileTools(projectId);
          const model = getModelConfig(llmConfig);

          const prompt = filenames && filenames.length > 0
            ? `${task}\n\nTarget files to inspect: ${filenames.join(', ')}`
            : task;

          const fileAnalystAgent = new ToolLoopAgent({
            model,
            instructions: `
You are a specialized file and knowledge analysis subagent for project files.
Your mission is to read and analyze project files (code, schemas, markdown, PDFs, documents) and extract the exact information requested.

Key Guidelines:
1. First use 'list_project_files' if you need to discover available files, or 'read_project_file' to inspect target files.
2. Synthesize and extract ONLY the relevant information, code blocks, or answers needed for the task.
3. NEVER dump full raw files or unnecessary boilerplate back to the parent agent.
4. Provide a structured, clear, and concise markdown answer summarizing your findings.
`.trim(),
            tools: fileTools as ToolSet,
            stopWhen: stepCountIs(8),
          });

          const result = await fileAnalystAgent.generate({
            prompt,
          });

          return result.text || 'No relevant information found in the project files.';
        } catch (error: any) {
          console.error('[FileAnalystSubagent] Error:', error);
          return `Error inspecting project files: ${error?.message || String(error)}`;
        }
      },
    }),
  };
}

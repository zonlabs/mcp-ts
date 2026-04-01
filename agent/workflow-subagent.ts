/**
 * Workflow specialist subagent (AI SDK subagent pattern).
 * @see https://ai-sdk.dev/docs/agents/subagents
 */
import { ToolLoopAgent, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { workflowCreate } from "@/tool/workflow-tools";

export const WORKFLOW_SUBAGENT_INSTRUCTIONS = `You are a workflow automation specialist. Your only job is to design workflows and persist them by calling WORKFLOW_CREATE.

## Rules
- Call WORKFLOW_CREATE exactly once with the full workflow when the plan is ready.
- Use toolkit "ai" for reasoning, analysis, summarization, or decisions. tool_slug examples: "deepseek/deepseek-chat", "openai/gpt-4o-mini".
- For MCP tool steps: toolkit should match the server type when obvious (e.g. "github") or "mcp". tool_slug MUST be the exact MCP tool name from the context the parent agent gave you — never invent names.
- AI steps: tool_arguments_json must be valid JSON with "system_prompt" and "user_prompt". Use {{params.key}} for user inputs and {{steps.N.output.content}} for prior steps.
- Include schedule_cron and schedule_name when the goal mentions recurring time (cron is UTC).
- Define input_properties and default_params_json when the user should customize values.
- After WORKFLOW_CREATE succeeds, your final assistant message must briefly summarize what was created and include the view_url from the tool output so the user can open the Workflows UI.

If the goal is impossible without required MCP tools that were not listed, explain what is missing instead of guessing tool names.`;

export function createWorkflowSubAgent(model: LanguageModel) {
  return new ToolLoopAgent({
    model,
    instructions: WORKFLOW_SUBAGENT_INSTRUCTIONS,
    tools: { WORKFLOW_CREATE: workflowCreate },
    stopWhen: stepCountIs(15),
  });
}

/**
 * Tool the main MCP Assistant uses to delegate workflow design to an isolated subagent
 * (separate context window, specialist instructions, WORKFLOW_CREATE only).
 */
export function createWorkflowDelegateDesignTool(model: LanguageModel) {
  const subagent = createWorkflowSubAgent(model);

  return tool({
    description: `Delegate creation of a new automated workflow to a specialist subagent. Use when the user wants to create, build, or schedule a multi-step automation.

Before calling this, gather MCP tool names from your available tools (mcp_* and LOCAL_MCP__* — for gateway tools, the description includes the original MCP tool name). Pass them in mcp_tools_summary so the subagent uses exact tool_slug values.

Do NOT use this for: listing workflows (use WORKFLOW_LIST), running a workflow (use WORKFLOW_RUN), or one-off chat tasks that do not need a saved workflow.`,
    inputSchema: z.object({
      goal: z
        .string()
        .describe("What to automate, including schedule hints (e.g. every 5 minutes, daily at 9am UTC)"),
      mcp_tools_summary: z
        .string()
        .optional()
        .describe(
          "Bullet list: each line = tool name + short purpose (from the main agent's tool list). Required when the workflow needs MCP tool steps."
        ),
    }),
    execute: async ({ goal, mcp_tools_summary }, { abortSignal }) => {
      const context = mcp_tools_summary?.trim()
        ? `## MCP tools the user has (use exact tool names as tool_slug for MCP steps)\n${mcp_tools_summary.trim()}`
        : "## No MCP tool list provided — prefer AI steps or ask the parent to reconnect servers; do not invent tool names.";

      const prompt = `${context}

## User goal
${goal}

Call WORKFLOW_CREATE once with the complete workflow. Then reply with a short summary and the view_url from the tool result.`;

      const result = await subagent.generate({ prompt, abortSignal });
      return result.text;
    },
  });
}

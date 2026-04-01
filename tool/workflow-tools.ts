import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

function safeParseJson(str: string | undefined | null): Record<string, unknown> {
  if (!str) return {};
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export const workflowCreate = tool({
  description: `Create a new workflow with steps and an optional schedule. Use this when the user asks you to create, build, or set up an automated workflow.

For each step:
- toolkit: "ai" for reasoning/analysis/summarization, or the MCP server type (e.g. "github", "mcp") for tool calls
- tool_slug: for AI steps use a model like "deepseek/deepseek-chat"; for MCP tool steps use the EXACT MCP tool name you can see in your available tools
- tool_arguments_json: a JSON string. AI steps MUST have "system_prompt" and "user_prompt" keys. MCP tool steps should have the tool's expected arguments. Use {{params.xyz}} for user-configurable inputs and {{steps.N.output.content}} to reference previous step output.

Example AI step tool_arguments_json: '{"system_prompt":"You are a code reviewer.","user_prompt":"Review this PR: {{params.pr_url}}"}'
Example MCP step tool_arguments_json: '{"owner":"{{params.repo_owner}}","repo":"{{params.repo_name}}","title":"{{steps.1.output.parsed_output.title}}"}'`,
  inputSchema: z.object({
    name: z.string().describe("Short workflow name"),
    description: z.string().describe("1-3 sentence description of what the workflow does"),
    steps: z
      .array(
        z.object({
          name: z.string().describe("Human-readable step name"),
          toolkit: z
            .string()
            .describe('Toolkit: "ai", "github", "mcp", "email", "slack", "http", etc.'),
          tool_slug: z
            .string()
            .describe(
              'For AI: model slug like "deepseek/deepseek-chat". For MCP: exact tool name.'
            ),
          tool_arguments_json: z
            .string()
            .describe("JSON string of tool arguments"),
          timeout_seconds: z.number().optional().describe("Timeout (default 120)"),
          retry_on_failure: z.boolean().optional().describe("Retry on failure (default true)"),
          max_retries: z.number().optional().describe("Max retries (default 1)"),
        })
      )
      .describe("Ordered list of workflow steps"),
    schedule_cron: z
      .string()
      .optional()
      .describe('Cron expression if the user wants it scheduled (e.g. "*/5 * * * *")'),
    schedule_name: z.string().optional().describe("Name for the schedule"),
    default_params_json: z
      .string()
      .optional()
      .describe("JSON string of default parameter values"),
    input_properties: z
      .array(
        z.object({
          key: z.string().describe("Parameter name"),
          type: z.string().describe("JSON Schema type: string, number, boolean"),
          description: z.string().describe("What this parameter is for"),
        })
      )
      .optional()
      .describe("Input parameters the user can customize when running"),
  }),
  async *execute({
    name,
    description,
    steps,
    schedule_cron,
    schedule_name,
    default_params_json,
    input_properties,
  }) {
    yield { state: "loading" as const };

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        yield {
          state: "output-error" as const,
          success: false,
          error: "Unauthorized — please sign in.",
        };
        return;
      }

      const inputSchema: Record<string, unknown> = {
        type: "object",
        properties: {} as Record<string, { type: string; description?: string }>,
      };
      for (const prop of input_properties ?? []) {
        (inputSchema.properties as Record<string, unknown>)[prop.key] = {
          type: prop.type,
          description: prop.description,
        };
      }

      const defaultParams = safeParseJson(default_params_json);

      const { data: workflow, error: wfError } = await supabase
        .from("workflows")
        .insert({
          user_id: user.id,
          name,
          description,
          workflow: [],
          input_schema: inputSchema,
          output_schema: { type: "object" },
          is_active: true,
        })
        .select("id, name, description, is_active, created_at")
        .single();

      if (wfError || !workflow) {
        yield {
          state: "output-error" as const,
          success: false,
          error: `Failed to create workflow: ${wfError?.message ?? "Unknown error"}`,
        };
        return;
      }

      const workflowId = workflow.id as string;

      const stepRows = steps.map((step, idx) => ({
        workflow_id: workflowId,
        step_number: idx + 1,
        name: step.name,
        toolkit: step.toolkit,
        tool_slug: step.tool_slug,
        tool_arguments: safeParseJson(step.tool_arguments_json),
        timeout_seconds: step.timeout_seconds ?? 120,
        retry_on_failure: step.retry_on_failure ?? true,
        max_retries: step.max_retries ?? 1,
      }));

      const { error: stepsError } = await supabase
        .from("workflow_steps")
        .insert(stepRows);

      if (stepsError) {
        await supabase.from("workflows").delete().eq("id", workflowId);
        yield {
          state: "output-error" as const,
          success: false,
          error: `Failed to create steps: ${stepsError.message}`,
        };
        return;
      }

      let schedule: Record<string, unknown> | null = null;
      if (schedule_cron) {
        const { data: sched, error: schedError } = await supabase
          .from("scheduled_workflows")
          .insert({
            workflow_id: workflowId,
            user_id: user.id,
            name: schedule_name ?? `${name} Schedule`,
            cron_expression: schedule_cron,
            status: "active",
            is_enabled: true,
            params: defaultParams,
          })
          .select("id, name, cron_expression, status, is_enabled, params, created_at")
          .single();
        if (!schedError && sched) schedule = sched;
      }

      yield {
        state: "output-available" as const,
        success: true,
        workflow: {
          ...workflow,
          toolkits: [...new Set(steps.map((s) => s.toolkit))],
          step_count: steps.length,
          schedule_count: schedule ? 1 : 0,
        },
        steps: steps.map((s) => ({
          name: s.name,
          toolkit: s.toolkit,
          tool_slug: s.tool_slug,
        })),
        schedule,
        default_params: defaultParams,
        message: `Workflow "${name}" created with ${steps.length} step(s)${schedule ? " and a schedule" : ""}.`,
        view_url: `/workflows/${workflowId}`,
      };
    } catch (error) {
      yield {
        state: "output-error" as const,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error creating workflow",
      };
    }
  },
});

export const workflowList = tool({
  description:
    "List the user's existing workflows. Use this when the user asks to see, list, or check their workflows.",
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe("Max workflows to return (default 20)"),
  }),
  async *execute({ limit }) {
    yield { state: "loading" as const };

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        yield {
          state: "output-error" as const,
          success: false,
          error: "Unauthorized — please sign in.",
        };
        return;
      }

      const { data: workflows, error } = await supabase
        .from("workflows")
        .select(
          "id, name, description, is_active, created_at, workflow_steps(toolkit), scheduled_workflows(id)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit ?? 20);

      if (error) {
        yield {
          state: "output-error" as const,
          success: false,
          error: error.message,
        };
        return;
      }

      type Row = {
        id: string;
        name: string;
        description: string | null;
        is_active: boolean;
        created_at: string;
        workflow_steps: Array<{ toolkit: string }>;
        scheduled_workflows: Array<{ id: string }>;
      };

      const result = ((workflows ?? []) as Row[]).map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        is_active: w.is_active,
        created_at: w.created_at,
        toolkits: [...new Set(w.workflow_steps.map((s) => s.toolkit))],
        step_count: w.workflow_steps.length,
        schedule_count: w.scheduled_workflows.length,
      }));

      yield {
        state: "output-available" as const,
        success: true,
        workflows: result,
        count: result.length,
        message: `Found ${result.length} workflow(s).`,
      };
    } catch (error) {
      yield {
        state: "output-error" as const,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const workflowRun = tool({
  description:
    "Manually trigger a workflow to run now. Use when the user asks to run, execute, or trigger a specific workflow.",
  inputSchema: z.object({
    workflow_id: z.string().describe("ID of the workflow to run"),
    params_json: z
      .string()
      .optional()
      .describe("JSON string of input parameters to pass to the workflow"),
  }),
  async *execute({ workflow_id, params_json }) {
    yield { state: "loading" as const };

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        yield {
          state: "output-error" as const,
          success: false,
          error: "Unauthorized — please sign in.",
        };
        return;
      }

      const { data: workflow, error: wfError } = await supabase
        .from("workflows")
        .select("id, name, is_active")
        .eq("id", workflow_id)
        .eq("user_id", user.id)
        .single();

      if (wfError || !workflow) {
        yield {
          state: "output-error" as const,
          success: false,
          error: "Workflow not found or you don't have access to it.",
        };
        return;
      }

      if (!workflow.is_active) {
        yield {
          state: "output-error" as const,
          success: false,
          error: `Workflow "${workflow.name}" is inactive. Activate it first.`,
        };
        return;
      }

      const engineUrl = process.env.WORKFLOW_ENGINE_URL || "http://localhost:3001";
      const params = safeParseJson(params_json);

      const res = await fetch(`${engineUrl}/api/workflows/${workflow_id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, params }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        yield {
          state: "output-error" as const,
          success: false,
          error: (errBody as Record<string, unknown>).error ?? `Engine returned ${res.status}`,
        };
        return;
      }

      const runResult = await res.json();

      yield {
        state: "output-available" as const,
        success: true,
        workflow_name: workflow.name,
        execution: runResult,
        message: `Workflow "${workflow.name}" has been triggered. Check the Workflows page for execution status.`,
      };
    } catch (error) {
      yield {
        state: "output-error" as const,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error running workflow",
      };
    }
  },
});

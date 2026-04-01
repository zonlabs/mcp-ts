import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText, Output } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { z } from "zod";

const StepSchema = z.object({
  name: z.string().describe("Human-readable step name"),
  toolkit: z
    .enum(["ai", "github", "email", "slack", "http", "webhook", "database", "file", "custom"])
    .describe("Which toolkit this step uses. Use 'ai' for any reasoning, analysis, or summarization task."),
  tool_slug: z
    .string()
    .describe(
      "For toolkit=ai: the AI model slug like 'openai/gpt-4o' or 'deepseek/deepseek-chat'. For MCP tools: the exact tool name."
    ),
  tool_arguments_json: z
    .string()
    .describe(
      'A valid JSON object string. For AI steps: must contain "system_prompt" and "user_prompt" keys. Use {{params.xyz}} for user inputs. Example: {"system_prompt":"You are...","user_prompt":"Summarize {{params.repo}}"}'
    ),
  timeout_seconds: z.number().describe("Timeout in seconds, typically 120"),
  retry_on_failure: z.boolean().describe("Whether to retry on transient failure"),
  max_retries: z.number().describe("Max retry count, typically 1"),
});

const InputProperty = z.object({
  key: z.string().describe("Parameter name, e.g. repo_owner"),
  type: z.string().describe("JSON Schema type: string, number, boolean"),
  description: z.string().describe("Human-readable description of what to enter"),
});

const WorkflowSchema = z.object({
  name: z.string().describe("Short, descriptive workflow name"),
  description: z.string().describe("1-3 sentence description of what the workflow does"),
  steps: z.array(StepSchema).describe("Ordered list of workflow steps (at least 1)"),
  schedule_name: z.string().optional().describe("Schedule name if user mentioned a recurring time"),
  schedule_cron: z
    .string()
    .optional()
    .describe("Cron expression in UTC if user mentioned a schedule (e.g. '*/5 * * * *', '0 9 * * 1')"),
  default_params_json: z
    .string()
    .optional()
    .describe('JSON object string of default parameter values, e.g. {"repo_owner":"microsoft","repo_name":"vscode"}'),
  input_properties: z
    .array(InputProperty)
    .optional()
    .describe("List of input parameters the user should be able to customize"),
});

function getModel() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required for workflow generation");
  return createDeepSeek({ apiKey })("deepseek-chat");
}

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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { prompt?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  let generated: z.infer<typeof WorkflowSchema>;
  try {
    const result = await generateText({
      model: getModel(),
      output: Output.object({ schema: WorkflowSchema }),
      system: `You are a workflow automation architect. The user describes what they want automated, and you design a complete workflow.

Rules:
- For any task involving reasoning, analysis, summarization, decision-making, or content generation, use toolkit="ai" with an appropriate model slug (e.g. "openai/gpt-4o", "deepseek/deepseek-chat").
- AI steps MUST have "system_prompt" and "user_prompt" keys in tool_arguments_json. Write detailed, specific prompts.
- Use {{params.xyz}} template syntax to reference user inputs (e.g. {{params.repo_owner}}, {{params.repo_name}}).
- Use {{steps.N.output.content}} to reference output from a previous step N.
- For MCP tool calls (e.g. GitHub API), use the appropriate toolkit like "github" and set tool_slug to the MCP tool name.
- If the user mentions a schedule (e.g. "every 5 minutes", "daily at 9am", "every Monday"), include schedule_name and schedule_cron.
- Infer sensible default_params_json from the description.
- Design input_properties for any values the user should be able to customize.
- Keep workflows focused — prefer fewer, well-designed steps over many fragmented ones.
- If a workflow involves fetching data AND then analyzing it, the AI agent can do both in a single AI step (it has access to MCP tools at runtime).
- tool_arguments_json and default_params_json must be valid JSON object strings.
- timeout_seconds should default to 120, retry_on_failure to true, max_retries to 1.`,
      prompt: `Design a workflow for: ${prompt}`,
    });

    if (!result.experimental_output) {
      throw new Error("AI did not return structured output");
    }
    generated = result.experimental_output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: `Failed to generate workflow: ${msg}` }, { status: 500 });
  }

  // Build input_schema from input_properties
  const inputSchema: { type: string; properties: Record<string, { type: string; description?: string }> } = {
    type: "object",
    properties: {},
  };
  for (const prop of generated.input_properties ?? []) {
    inputSchema.properties[prop.key] = { type: prop.type, description: prop.description };
  }

  const defaultParams = safeParseJson(generated.default_params_json);

  // Persist the workflow
  const { data: workflow, error: wfError } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name: generated.name,
      description: generated.description,
      workflow: [],
      input_schema: inputSchema,
      output_schema: { type: "object" },
      is_active: true,
    })
    .select("id, name, description, is_active, created_at")
    .single();

  if (wfError || !workflow) {
    return NextResponse.json({ error: `DB error: ${wfError?.message}` }, { status: 500 });
  }

  const workflowId = workflow.id as string;

  // Parse and insert steps
  const parsedSteps = generated.steps.map((step) => ({
    ...step,
    tool_arguments: safeParseJson(step.tool_arguments_json),
  }));

  const stepRows = parsedSteps.map((step, idx) => ({
    workflow_id: workflowId,
    step_number: idx + 1,
    name: step.name,
    toolkit: step.toolkit,
    tool_slug: step.tool_slug,
    tool_arguments: step.tool_arguments,
    timeout_seconds: step.timeout_seconds ?? 120,
    retry_on_failure: step.retry_on_failure ?? true,
    max_retries: step.max_retries ?? 1,
  }));

  const { error: stepsError } = await supabase.from("workflow_steps").insert(stepRows);
  if (stepsError) {
    await supabase.from("workflows").delete().eq("id", workflowId);
    return NextResponse.json({ error: `Failed to create steps: ${stepsError.message}` }, { status: 500 });
  }

  // Insert schedule if provided
  let schedule = null;
  if (generated.schedule_cron) {
    const { data: sched, error: schedError } = await supabase
      .from("scheduled_workflows")
      .insert({
        workflow_id: workflowId,
        user_id: user.id,
        name: generated.schedule_name ?? `${generated.name} Schedule`,
        cron_expression: generated.schedule_cron,
        status: "active",
        is_enabled: true,
        params: defaultParams,
      })
      .select("id, name, cron_expression, status, is_enabled, params, created_at")
      .single();
    if (!schedError) schedule = sched;
  }

  return NextResponse.json(
    {
      workflow: {
        ...workflow,
        toolkits: [...new Set(parsedSteps.map((s) => s.toolkit))],
        step_count: parsedSteps.length,
        schedule_count: schedule ? 1 : 0,
      },
      steps: parsedSteps.map((s) => ({
        name: s.name,
        toolkit: s.toolkit,
        tool_slug: s.tool_slug,
        tool_arguments: s.tool_arguments,
      })),
      schedule,
      default_params: defaultParams,
    },
    { status: 201 }
  );
}

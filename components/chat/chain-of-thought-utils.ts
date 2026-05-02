export type ChainOfThoughtStepStatus = "complete" | "active" | "pending";

export type ChainOfThoughtPart = {
  type?: string;
  text?: string;
  state?: string;
  [key: string]: unknown;
};

export type ChainOfThoughtToolStep = {
  key: string;
  label: string;
  description: string;
  status: ChainOfThoughtStepStatus;
  hasError?: boolean;
  iconKey?: ToolStepIconKey;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type ChainOfThoughtSummary = {
  hasChainOfThought: boolean;
  reasoningText: string;
  toolSteps: ChainOfThoughtToolStep[];
};

type BuildChainOfThoughtSummaryOptions = {
  getToolName: (part: ChainOfThoughtPart) => string | undefined;
  isLastMessage: boolean;
  status: string;
};

const ACTIVE_TOOL_STATES = new Set(["executing", "in-progress"]);
const PENDING_TOOL_STATES = new Set([
  "input-available",
  "input-streaming",
  "approval-requested",
  "approval-responded",
]);

export type ToolStepIconKey =
  | "execute"
  | "read"
  | "search"
  | "tool";

export function isChainOfThoughtToolPart(part: ChainOfThoughtPart): boolean {
  return (
    typeof part.type === "string" &&
    (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
  );
}

export function getToolStepStatus(
  state: string | undefined,
  isLastMessage: boolean,
  status: string
): ChainOfThoughtStepStatus {
  if (state === "output-available" || state === "output-error") {
    return "complete";
  }

  if (state && ACTIVE_TOOL_STATES.has(state)) {
    return "active";
  }

  if (isLastMessage && (status === "streaming" || status === "submitted")) {
    return "active";
  }

  if (state && PENDING_TOOL_STATES.has(state)) {
    return "pending";
  }

  return "pending";
}

export function getToolStepDescription(state: string | undefined): string {
  if (state === "output-available") return "Completed";
  if (state === "output-error") return "Error";
  if (state === "executing" || state === "in-progress") return "Running";
  if (state === "approval-requested") return "Waiting for approval";
  if (state === "approval-responded") return "Approval received";
  return "Preparing";
}

export function getToolStepIconKey(toolName: string | undefined): ToolStepIconKey {
  const normalized = (toolName || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");

  if (/(^|\s)(search|find|query|lookup|list)(\s|$)/.test(normalized)) return "search";
  if (/(^|\s)(execute|run|call|invoke|submit|send|write|create|update|delete)(\s|$)/.test(normalized)) {
    return "execute";
  }
  if (/(^|\s)(read|get|fetch|load|retrieve|open|schema|definition|describe|metadata)(\s|$)/.test(normalized)) {
    return "read";
  }

  return "tool";
}

export function hasToolStepDetails(step: ChainOfThoughtToolStep): boolean {
  return step.input !== undefined || step.output !== undefined || Boolean(step.errorText);
}

export function buildChainOfThoughtSummary(
  parts: ChainOfThoughtPart[],
  options: BuildChainOfThoughtSummaryOptions
): ChainOfThoughtSummary {
  const reasoningText = parts
    .filter((part) => part.type === "reasoning" && part.text)
    .map((part) => part.text)
    .join("\n\n");

  const toolSteps = parts.flatMap((part, index) => {
    if (!isChainOfThoughtToolPart(part)) return [];

    const label =
      options.getToolName(part) ||
      (typeof part.type === "string" ? part.type.replace(/^tool-/, "") : "tool");

    const step: ChainOfThoughtToolStep = {
      description: getToolStepDescription(part.state),
      iconKey: getToolStepIconKey(label),
      key: `tool-${index}`,
      label,
      status: getToolStepStatus(part.state, options.isLastMessage, options.status),
    };

    if ("input" in part) step.input = part.input;
    if ("output" in part) step.output = part.output;
    if (part.state === "output-error") step.hasError = true;
    if (typeof part.errorText === "string") step.errorText = part.errorText;

    return [step];
  });

  return {
    hasChainOfThought: Boolean(reasoningText || toolSteps.length > 0),
    reasoningText,
    toolSteps,
  };
}

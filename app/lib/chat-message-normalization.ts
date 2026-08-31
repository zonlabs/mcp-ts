type MessageWithParts = {
  role?: string;
  parts?: any[];
  toolInvocations?: any[];
  [key: string]: any;
};

function getToolCallId(part: any): string | undefined {
  return part?.toolCallId || part?.toolInvocation?.toolCallId;
}

function getToolPartState(part: any): string | undefined {
  return part?.state || part?.toolInvocation?.state;
}

function isToolResultState(state: string | undefined): boolean {
  return state === "result" || state === "output-available";
}

function isResumableApprovalState(state: string | undefined): boolean {
  return (
    state === "approval-requested" ||
    state === "approval-responded" ||
    state === "output-denied"
  );
}

function isToolPart(part: any): boolean {
  return Boolean(
    part &&
      (
        (typeof part?.type === "string" && part.type.startsWith("tool-")) ||
        part?.type === "tool-invocation"
      )
  );
}

function normalizeToolInvocation(invocation: any) {
  if (
    invocation &&
    invocation.state !== "result" &&
    invocation.state !== "output-available" &&
    invocation.state !== "approval-responded" &&
    typeof invocation.toolName === "string" &&
    invocation.toolName.startsWith("MCPASSISTANT_")
  ) {
    return {
      ...invocation,
      state: "result",
      result: invocation.output || { success: true, message: "Action verified by user." },
    };
  }

  return invocation;
}

function normalizePart(part: any) {
  if (
    part?.type === "tool-invocation" &&
    part.toolInvocation &&
    part.toolInvocation.state !== "result" &&
    part.toolInvocation.toolName === "MCPASSISTANT_INITIATE_CONNECTION"
  ) {
    const denied = part.toolInvocation?.approval?.approved === false;
    return {
      ...part,
      toolInvocation: {
        ...part.toolInvocation,
        state: "result",
        result: denied
          ? {
              success: false,
              message:
                part.toolInvocation?.approval?.reason ||
                "Connection request denied by user.",
            }
          : { success: true, message: "Connection verified actively by user." },
      },
    };
  }

  if (
    typeof part?.type === "string" &&
    part.type.startsWith("tool-MCPASSISTANT_") &&
    (part.state === "output-available" || part.state === "ready")
  ) {
    const denied = part.approval?.approved === false;
    return {
      ...part,
      state: "output-available",
      output:
        part.output ||
        (denied
          ? {
              success: false,
              message: part.approval?.reason || "Connection request denied by user.",
            }
          : { success: true, message: "Action verified by user." }),
    };
  }

  return part;
}

export function normalizeMessagesForModel<T extends MessageWithParts>(messages: T[]): T[] {
  return messages.map((msg, messageIndex) => {
    const newMsg = { ...msg };
    const isTerminalAssistantMessage =
      newMsg.role === "assistant" && messageIndex === messages.length - 1;

    if (Array.isArray(newMsg.toolInvocations)) {
      newMsg.toolInvocations = newMsg.toolInvocations.map(normalizeToolInvocation);
    }

    if (Array.isArray(newMsg.parts)) {
      newMsg.parts = newMsg.parts.map(normalizePart);

      const resultToolCallIds = new Set<string>();
      for (const part of newMsg.parts) {
        const toolCallId = getToolCallId(part);
        if (!toolCallId) continue;
        if (isToolResultState(getToolPartState(part))) {
          resultToolCallIds.add(toolCallId);
        }
      }

      const seenPartKeys = new Set<string>();
      newMsg.parts = newMsg.parts.filter((part: any) => {
        const toolCallId = getToolCallId(part);
        if (!toolCallId) return true;

        const partState = getToolPartState(part);

        if (
          newMsg.role === "assistant" &&
          isToolPart(part) &&
          !isToolResultState(partState) &&
          !(isTerminalAssistantMessage && isResumableApprovalState(partState)) &&
          !resultToolCallIds.has(toolCallId)
        ) {
          return false;
        }

        const payload =
          part?.input ??
          part?.output ??
          part?.toolInvocation?.input ??
          part?.toolInvocation?.result ??
          null;

        const dedupeKey = `${toolCallId}:${part?.type || "unknown"}:${partState || "unknown"}:${JSON.stringify(payload)}`;
        if (seenPartKeys.has(dedupeKey)) return false;
        seenPartKeys.add(dedupeKey);
        return true;
      });
    }

    return newMsg;
  });
}

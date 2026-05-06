type MessageWithParts = {
  parts?: any[];
  toolInvocations?: any[];
  [key: string]: any;
};

function getToolCallId(part: any): string | undefined {
  return part?.toolCallId || part?.toolInvocation?.toolCallId;
}

export function normalizeMessagesForModel<T extends MessageWithParts>(messages: T[]): T[] {
  return messages.map((msg) => {
    const newMsg = { ...msg };

    if (Array.isArray(newMsg.toolInvocations)) {
      newMsg.toolInvocations = newMsg.toolInvocations.map((ti: any) => {
        if (
          ti.state !== "result" &&
          ti.state !== "output-available" &&
          ti.toolName.startsWith("MCPASSISTANT_")
        ) {
          return {
            ...ti,
            state: "result",
            result: ti.output || { success: true, message: "Action verified by user." },
          };
        }
        return ti;
      });
    }

    if (Array.isArray(newMsg.parts)) {
      newMsg.parts = newMsg.parts.map((p: any) => {
        if (
          p.type === "tool-invocation" &&
          p.toolInvocation &&
          p.toolInvocation.state !== "result" &&
          p.toolInvocation.toolName === "MCPASSISTANT_INITIATE_CONNECTION"
        ) {
          const denied = p.toolInvocation?.approval?.approved === false;
          return {
            ...p,
            toolInvocation: {
              ...p.toolInvocation,
              state: "result",
              result: denied
                ? {
                    success: false,
                    message:
                      p.toolInvocation?.approval?.reason ||
                      "Connection request denied by user.",
                  }
                : { success: true, message: "Connection verified actively by user." },
            },
          };
        }

        if (
          typeof p.type === "string" &&
          p.type.startsWith("tool-MCPASSISTANT_") &&
          (p.state === "approval-responded" ||
            p.state === "output-available" ||
            p.state === "ready")
        ) {
          const denied = p.approval?.approved === false;
          return {
            ...p,
            state: "output-available",
            output:
              p.output ||
              (denied
                ? {
                    success: false,
                    message: p.approval?.reason || "Connection request denied by user.",
                  }
                : { success: true, message: "Action verified by user." }),
          };
        }

        return p;
      });

      const seenToolCallIds = new Set<string>();
      newMsg.parts = newMsg.parts.filter((p: any) => {
        const toolCallId = getToolCallId(p);
        if (!toolCallId) return true;
        if (seenToolCallIds.has(toolCallId)) return false;
        seenToolCallIds.add(toolCallId);
        return true;
      });
    }

    return newMsg;
  });
}

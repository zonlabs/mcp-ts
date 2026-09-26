import { UIMessage, createAgentUIStreamResponse } from "ai";
import { createDeferCodeModeAgent } from "../../agent/defer-codemode-agent";

export const maxDuration = 60; // Max serverless function duration

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const agent = await createDeferCodeModeAgent(process.env.NEXT_PUBLIC_MCP_USER_ID!);

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    messageMetadata: ({ part }: any) => {
      if (part.type === 'tool-call') {
        console.log('[DEBUG examples/next] tool-call part keys:', Object.keys(part));
        console.log('[DEBUG examples/next] tool-call part:', JSON.stringify(part, null, 2));
        console.log('[DEBUG examples/next] (part as any).mcp:', (part as any).mcp);
        console.log(
          '[DEBUG examples/next] (agent as any).tools?.[part.toolName]?.mcp:',
          (agent as any).tools?.[part.toolName]?.mcp
        );
      }
      return undefined;
    },
  });
}

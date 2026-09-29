// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat
//
// Clean AI SDK streaming endpoint with trigger-based routing.
// ─────────────────────────────────────────────────────────────────────────────

import {
  convertToModelMessages,
  createIdGenerator,
  generateText,
  createUIMessageStreamResponse,
  toUIMessageStream,
  pruneMessages,
} from 'ai';
import { createChatAgent, type ChatUIMessage } from '@/agent/chat-agent';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { saveChat, deleteAllChatMessages } from '@/lib/chat-store';
import { getTitleModel, resolveMaxTokens } from '@/lib/llm';
import type { UserPreferences } from '@/lib/user-preferences';
import { normalizeMessagesForModel, sanitizeModelMessages } from '@/lib/chat-message-normalization';
import { retrieveMemoryContext, addMemories } from '@/lib/memory/mem0';
import type { MemoryScope } from '@/lib/projects';
import { autoCompactChatHistory } from '@/lib/compaction';

import { z } from 'zod';
import { resolveChatAccess, hasProjectEditAccess } from '@/lib/chat-auth.server';

const ChatRequestSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  trigger: z.enum(['submit-user-message', 'regenerate-assistant-message']).default('submit-user-message'),
  messageId: z.string().optional(),
  message: z.any().optional(),
  messages: z.array(z.any()).default([]),
  llmConfig: z.object({
    provider: z.string().optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    baseUrl: z.string().optional(),
    maxTokens: z.number().int().positive().optional(),
  }).optional(),
  userPreferences: z.record(z.any()).optional(),
});

type ChatRequestBody = z.infer<typeof ChatRequestSchema>;

async function assertChatPermission(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  chatId: string,
  user: { id: string; email?: string | null }
): Promise<{ denied: NextResponse | null; existingProjectId?: string | null }> {
  const access = await resolveChatAccess(supabase, chatId, user);
  if (!access.chat) return { denied: null, existingProjectId: null };

  if (!access.canEdit) {
    const message = access.collaboratorRole === 'viewer'
      ? 'Read-only access: Viewers cannot send messages'
      : 'Forbidden: Chat is read-only for non-collaborators';
    return { denied: NextResponse.json({ error: message }, { status: 403 }) };
  }

  return { denied: null, existingProjectId: access.chat.project_id };
}

async function assertProjectEditPermission(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  projectId: string,
  user: { id: string; email?: string | null }
): Promise<NextResponse | null> {
  const canEdit = await hasProjectEditAccess(supabase, projectId, user.id, user.email);
  if (!canEdit) {
    return NextResponse.json({ error: 'Forbidden: No edit access to this project' }, { status: 403 });
  }
  return null;
}

function extractUserText(messages: ChatUIMessage[]): string {
  for (const message of messages) {
    if (message?.role !== 'user') continue;
    if (Array.isArray((message as any)?.parts)) {
      const text = (message as any).parts
        .filter((p: any) => p?.type === 'text' && p.text)
        .map((p: any) => p.text)
        .join(' ')
        .trim();
      if (text) return text;
    }
    const content = (message as any)?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .filter((c: any) => c?.type === 'text' && c.text)
        .map((c: any) => c.text)
        .join(' ')
        .trim();
      if (text) return text;
    }
    const raw = (message as any)?.text;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

const TITLE_SYSTEM_PROMPT = `You are a chat title generator. Output ONLY a concise title (3 to 6 words) summarizing the user's message. Do NOT answer the question. Do NOT use quotes or punctuation at the start/end.`;
const NEW_CHAT_TITLE = 'New Chat';

function fallbackTitleFromUserMessage(userText: string): string {
  return userText.length > 50 ? `${userText.slice(0, 47)}...` : userText;
}

async function generateTitleFromUserMessage(
  userText: string,
  llmConfig?: ChatRequestBody['llmConfig']
): Promise<string | null> {
  try {
    const { text } = await generateText({
      system: TITLE_SYSTEM_PROMPT,
      model: getTitleModel(llmConfig),
      prompt: `User message: "${userText}"\n\nTitle:`,
      maxOutputTokens: 64,
    });
    const cleaned = text
      .replace(/^[#*"\s]+/, '')
      .replace(/["]+$/, '')
      .trim();
    return cleaned || null;
  } catch (err) {
    console.error('[generateTitleFromUserMessage] Failed:', err);
    return null;
  }
}

async function claimTitleGeneration(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  chatId: string,
  userId: string,
  userText: string
): Promise<boolean> {
  const fallbackTitle = fallbackTitleFromUserMessage(userText);
  const { data, error } = await supabase
    .from('chats')
    .update({ title: fallbackTitle, updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('user_id', userId)
    .or(`title.is.null,title.eq.${NEW_CHAT_TITLE}`)
    .select('id');

  if (error) {
    console.error('[claimTitleGeneration] Failed:', error);
    return false;
  }

  return (data?.length ?? 0) === 1;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawJson = await req.json().catch(() => null);
    const parsed = ChatRequestSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      id: chatId,
      projectId,
      trigger,
      message,
      messageId,
      messages,
      llmConfig,
      userPreferences,
    } = parsed.data;

    // 1. Build messages list based on standard AI SDK trigger
    let chatMessages = Array.isArray(messages) ? [...messages] : [];
    if (trigger === 'submit-user-message' && message) {
      chatMessages = [...chatMessages.filter((m) => m.id !== message.id), message];
    } else if (trigger === 'regenerate-assistant-message' && messageId) {
      const idx = chatMessages.findIndex((m) => m.id === messageId);
      if (idx !== -1) chatMessages = chatMessages.slice(0, idx);
    }

    if (chatMessages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // 2. Permission check, project resolution, and pre-stream database sync
    let titlePromise: Promise<string | null> | null = null;
    let activeProjectId: string | undefined = projectId;

    if (projectId) {
      const projectDenied = await assertProjectEditPermission(supabase, projectId, user);
      if (projectDenied) return projectDenied;
    }

    if (chatId) {
      const { denied, existingProjectId } = await assertChatPermission(supabase, chatId, user);
      if (denied) return denied;
      if (!activeProjectId && existingProjectId) {
        activeProjectId = existingProjectId;
      }

      const isEditSync = trigger === 'regenerate-assistant-message' && chatMessages[chatMessages.length - 1]?.role === 'user';
      if (isEditSync) {
        const lastMsg = chatMessages[chatMessages.length - 1];
        const editTimestamp = (lastMsg as any)?.createdAt || (lastMsg as any)?.created_at;
        await deleteAllChatMessages(chatId, editTimestamp);
        await saveChat(chatId, chatMessages, { projectId: activeProjectId });
      } else if (trigger === 'submit-user-message' && message) {
        await saveChat(chatId, [message], { projectId: activeProjectId });
      }

      if (activeProjectId) {
        await supabase
          .from('chats')
          .update({ project_id: activeProjectId })
          .eq('id', chatId)
          .is('project_id', null);
      }

      // Auto-title generation kick-off (runs in background without blocking TTFT, matching chatbot)
      const userMessages = chatMessages.filter((m) => m.role === 'user');
      if (userMessages.length === 1 && trigger === 'submit-user-message') {
        const userText = extractUserText(userMessages);
        if (userText && await claimTitleGeneration(supabase, chatId, user.id, userText)) {
          titlePromise = generateTitleFromUserMessage(userText, llmConfig);
        }
      }
    }

    // 3. Resolve project configuration (custom instructions, memory scope)
    let projectInstructions = '';
    let memoryScope: MemoryScope = 'global';

    if (activeProjectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('id, name, custom_instructions, memory_scope')
        .eq('id', activeProjectId)
        .maybeSingle();

      if (project) {
        if (project.custom_instructions) {
          projectInstructions = project.custom_instructions;
        }
        if (project.memory_scope) {
          memoryScope = project.memory_scope as MemoryScope;
        }

        // Fetch attached project files manifest for the agent
        const { data: projectFiles } = await supabase
          .from('project_files')
          .select('name, size_bytes')
          .eq('project_id', activeProjectId)
          .limit(25);

        if (projectFiles && projectFiles.length > 0) {
          const fileList = projectFiles
            .map((f) => `${f.name} (${Math.max(1, Math.round(f.size_bytes / 1024))}KB)`)
            .join(', ');
          const fileNotice = `\n\n[Project Knowledge Files: ${fileList}. Use the inspect_project_knowledge tool to search, inspect, or extract answers from any project file.]`;
          projectInstructions = projectInstructions ? `${projectInstructions}${fileNotice}` : fileNotice.trim();
        }
      }
    }

    // 4. Retrieve memory context based on user preferences and project memory_scope
    const isMemoryEnabled = userPreferences?.enableMemory !== false;
    const userText = extractUserText(chatMessages);
    let memory = '';
    if (isMemoryEnabled && userText) {
      if (memoryScope === 'project' && activeProjectId) {
        memory = await retrieveMemoryContext(userText, { userId: user.id, runId: activeProjectId });
      } else {
        memory = await retrieveMemoryContext(userText, { userId: user.id });
      }
    }

    // 5. Stream response via Chat Agent
    const agent = await createChatAgent({
      userId: user.id,
      chatId,
      runId: chatId,
      projectId: activeProjectId || undefined,
      userPreferences,
      memory,
      projectInstructions,
      memoryScope,
      llmConfig,
      abortSignal: req.signal,
    });

    // 6. Sliding-window auto-compaction and structural message pruning
    const compactedMessages = await autoCompactChatHistory(chatMessages, llmConfig);
    const normalizedMessages = normalizeMessagesForModel(compactedMessages);
    const generateId = createIdGenerator({ prefix: 'msg', size: 16 });
    const rawModelMessages = sanitizeModelMessages(await convertToModelMessages(normalizedMessages));
    const modelMessages = pruneMessages({
      messages: rawModelMessages,
      reasoning: 'all',
      toolCalls: 'before-last-2-messages',
      emptyMessages: 'remove',
    });

    const result = await agent.stream({
      messages: modelMessages,
      abortSignal: req.signal,
    });

    let resolvedTitle: string | undefined;
    if (titlePromise) {
      titlePromise.then((t) => {
        if (t) resolvedTitle = t;
      });
    }

    const streamStartTime = Date.now();

    return createUIMessageStreamResponse({
      stream: toUIMessageStream<any, ChatUIMessage>({
        stream: result.stream,
        sendSources: true,
        originalMessages: normalizedMessages,
        generateMessageId: () => generateId(),
        messageMetadata: ({ part }) => {
          const base = resolvedTitle ? { isNewChat: true, chatTitle: resolvedTitle } : {};

          if (part.type === 'tool-call') {
            const mcpInfo = (agent as any).tools?.[part.toolName]?.mcp;
            if (mcpInfo) {
              return {
                ...base,
                mcp: { [part.toolName]: mcpInfo },
              };
            }
          }

          if (part.type === 'finish-step') {
            const streamEndTime = Date.now();
            const durationSeconds = Math.max(1, Math.round((streamEndTime - streamStartTime) / 1000));
            const responseModel =
              (part as any)?.response?.modelId ||
              (part as any)?.modelId ||
              llmConfig?.model ||
              'openrouter/auto';
            return {
              ...base,
              durationSeconds,
              thinkingStartTimeMs: streamStartTime,
              thinkingEndTimeMs: streamEndTime,
              usage: (part as any)?.usage,
              model: responseModel,
            };
          }
          return Object.keys(base).length > 0 ? base : undefined;
        },
        onFinish: async ({ responseMessage }) => {
          if (!chatId || !responseMessage) return;

          try {
            if (trigger === 'regenerate-assistant-message' && messageId) {
              await supabase.from('chat_messages').delete().eq('chat_id', chatId).eq('message_id', messageId);
            }

            const streamEndTime = Date.now();
            const durationSeconds = Math.max(1, Math.round((streamEndTime - streamStartTime) / 1000));
            const resolvedModel =
              (responseMessage as any)?.metadata?.model ||
              llmConfig?.model ||
              'openrouter/auto';
            (responseMessage as any).metadata = {
              ...((responseMessage as any).metadata || {}),
              durationSeconds,
              thinkingStartTimeMs: streamStartTime,
              thinkingEndTimeMs: streamEndTime,
              model: resolvedModel,
            };

            await saveChat(chatId, [responseMessage], { projectId: activeProjectId });

            // Background extraction: persist conversation turn to Mem0 asynchronously if enabled
            if (isMemoryEnabled && userText) {
              const assistantParts = Array.isArray((responseMessage as any)?.parts)
                ? (responseMessage as any).parts
                : [];
              const assistantText = assistantParts
                .filter((p: any) => p?.type === 'text' && p.text)
                .map((p: any) => p.text)
                .join(' ')
                .trim();

              if (assistantText) {
                const memOptions: any = { userId: user.id, metadata: { chatId } };
                if (memoryScope === 'project' && activeProjectId) {
                  memOptions.runId = activeProjectId;
                  memOptions.metadata.projectId = activeProjectId;
                }
                void addMemories(
                  [
                    { role: 'user', content: userText },
                    { role: 'assistant', content: assistantText },
                  ],
                  memOptions
                );
              }
            }

            if (titlePromise) {
              try {
                const title = await titlePromise;
                if (title) {
                  const upsertData: any = {
                    id: chatId,
                    title,
                    user_id: user.id,
                    updated_at: new Date().toISOString(),
                  };
                  if (activeProjectId) {
                    upsertData.project_id = activeProjectId;
                  }
                  await supabase.from('chats').upsert(upsertData);
                }
              } catch (err) {
                console.error('[chat:onFinish] Error saving title:', err);
              }
            }
          } catch (err) {
            console.error('[chat:onFinish] Error saving assistant message / title:', err);
          }
        },
        onError: (err) => {
          console.error('[api/chat] toUIMessageStream error:', err);
          return err instanceof Error ? err.message : 'Stream processing error occurred.';
        },
      }),
    });
  } catch (fatalError: any) {
    console.error('[api/chat] Top-level handler fatal error:', fatalError);
    return NextResponse.json(
      { error: fatalError?.message || 'Internal server error', details: String(fatalError) },
      { status: 500 }
    );
  }
}

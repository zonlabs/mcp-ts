/**
 * Centralized Type Definitions for Chats, Chat Messages, and Pagination.
 * @module types/chats
 */

import type {
  ChatUIMessage,
  AgentMessageMetadata,
} from "@/agent/chat-agent";

export type {
  ChatUIMessage,
  AgentMessageMetadata,
};

/**
 * Chat visibility and access scope.
 */
export type ChatVisibility = "PRIVATE" | "PUBLIC";

/**
 * Chat entity model as represented in the sidebar navigation and list views.
 */
export interface SidebarChat {
  id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string | null;
  visibility?: string | null;
  is_pinned?: boolean | null;
  user_id?: string | null;
  project_id?: string | null;
}

/**
 * Paginated sidebar chat collection returned by the sidebar chat loader.
 */
export interface PaginatedSidebarChats {
  chats: SidebarChat[];
  hasMore: boolean;
  nextOffset: number | null;
}

/**
 * Parameters for cursor-based reverse pagination of chat messages.
 */
export interface ChatPaginationOptions {
  limit?: number;
  before?: string;
}

/**
 * Paginated result of chat messages returned by the API and database store.
 */
export interface PaginatedChatResult<T = ChatUIMessage> {
  messages: T[];
  hasMore: boolean;
  oldestCursor: string | null;
}

/**
 * In-memory stored chat payload used by TanStack Query and client chat hooks.
 */
export interface StoredChatData {
  messages: any[];
  hasMore?: boolean;
  oldestCursor?: string | null;
}

/**
 * Payload parameters for updating an existing chat's metadata.
 */
export interface UpdateChatParams {
  id: string;
  title?: string;
  is_pinned?: boolean;
  visibility?: ChatVisibility;
  project_id?: string | null;
}

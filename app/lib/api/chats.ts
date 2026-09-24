import { apiClient } from "./client";
import type { PaginatedSidebarChats, SidebarChat } from "@/lib/sidebar-chats";

export const chatsApi = {
  /**
   * Fetch paginated sidebar chats for the current user.
   */
  list: (limit: number = 20, offset: number = 0) =>
    apiClient<PaginatedSidebarChats>("/api/chats", {
      params: { limit, offset },
    }),

  /**
   * Fetch a single chat's messages and metadata by ID.
   */
  getById: (chatId: string) =>
    apiClient<{ messages: any[] }>(`/api/chats`, {
      params: { id: chatId },
    }),

  /**
   * Update chat fields (e.g. title, pinned, visibility, project_id).
   */
  update: (chatId: string, updates: Partial<SidebarChat>) =>
    apiClient<{ id: string; [key: string]: any }>(`/api/chats`, {
      method: "PATCH",
      params: { id: chatId },
      body: JSON.stringify(updates),
    }),

  /**
   * Delete a single chat by ID.
   */
  delete: (chatId: string) =>
    apiClient<{ success?: boolean }>(`/api/chats`, {
      method: "DELETE",
      params: { id: chatId },
    }),

  /**
   * Update visibility of a single chat (e.g. PUBLIC or PRIVATE).
   */
  updateVisibility: (chatId: string, visibility: "PUBLIC" | "PRIVATE") =>
    apiClient<{ success?: boolean }>(`/api/chats`, {
      method: "PATCH",
      params: { id: chatId },
      body: JSON.stringify({ visibility }),
    }),

  /**
   * Revoke all public shared links, making them private.
   */
  revokeAllShared: () =>
    apiClient<{ success?: boolean }>(`/api/chats`, {
      method: "PATCH",
      params: { revokeAll: true },
    }),

  /**
   * Delete all conversations for the authenticated user.
   */
  deleteAll: () =>
    apiClient<{ success?: boolean }>(`/api/chats`, {
      method: "DELETE",
      params: { all: true },
    }),

  /**
   * Download exported JSON archive of conversations.
   */
  downloadExport: async (chatId?: string): Promise<void> => {
    const url = chatId ? `/api/chats/export?id=${encodeURIComponent(chatId)}` : "/api/chats/export";
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to export chat data");
    }
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `linkos-chats-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  },
};

import { apiClient } from "./client";

export interface MemoryItem {
  id: string;
  memory: string;
  created_at?: string;
}

export const memoriesApi = {
  /**
   * List all stored memories for the user.
   */
  list: () => apiClient<{ memories: MemoryItem[] }>("/api/memories"),

  /**
   * Create a new memory fact.
   */
  create: (fact: string, category?: string) =>
    apiClient<{ success: boolean }>("/api/memories", {
      method: "POST",
      body: JSON.stringify({ fact, category }),
    }),

  /**
   * Delete a single memory by ID.
   */
  delete: (id: string) =>
    apiClient<{ success?: boolean }>("/api/memories", {
      method: "DELETE",
      params: { id },
    }),

  /**
   * Delete all memories for the user.
   */
  deleteAll: () =>
    apiClient<{ success?: boolean }>("/api/memories", {
      method: "DELETE",
      params: { all: true },
    }),
};

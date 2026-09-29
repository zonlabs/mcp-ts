import { apiClient } from "./client";

export interface StorageUsage {
  used_bytes: number;
  limit_bytes: number;
  file_count: number;
}

export const storageApi = {
  /**
   * Fetch cumulative storage usage and quota allocation for the authenticated user.
   */
  getUsage: () => apiClient<StorageUsage>("/api/storage"),

  /**
   * Delete all uploaded project files, clearing storage.
   */
  deleteAllFiles: () =>
    apiClient<{ success?: boolean }>("/api/storage", {
      method: "DELETE",
      params: { all: true },
    }),
};

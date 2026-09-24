import { apiClient } from "./client";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectChat,
  ProjectFile,
} from "@/types/projects";

export const projectsApi = {
  /**
   * Fetch all user projects.
   */
  list: () => apiClient<{ projects: Project[] }>("/api/projects"),

  /**
   * Fetch details for a specific project by ID.
   */
  getById: (projectId: string) =>
    apiClient<{ project: Project; chats: ProjectChat[] }>(`/api/projects/${projectId}`),

  /**
   * Create a new project.
   */
  create: (input: CreateProjectInput) =>
    apiClient<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * Update an existing project by ID.
   */
  update: (projectId: string, patch: UpdateProjectInput) =>
    apiClient<{ project: Project }>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  /**
   * Delete a project by ID.
   */
  delete: (projectId: string) =>
    apiClient<{ success?: boolean }>(`/api/projects/${projectId}`, {
      method: "DELETE",
    }),

  /**
   * Delete all projects for the authenticated user.
   */
  deleteAll: () =>
    apiClient<{ success?: boolean }>("/api/projects", {
      method: "DELETE",
      params: { all: true },
    }),

  /**
   * List files attached to a project.
   */
  listFiles: (projectId: string) =>
    apiClient<{ files: ProjectFile[] }>(`/api/projects/${projectId}/files`),

  /**
   * Upload a file to a project (multipart form data).
   */
  uploadFile: async (projectId: string, file: File): Promise<{ file: ProjectFile }> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to upload file");
    }

    return (await res.json()) as { file: ProjectFile };
  },

  /**
   * Delete an attached project file by ID.
   */
  deleteFile: (projectId: string, fileId: string) =>
    apiClient<{ success?: boolean }>(`/api/projects/${projectId}/files/${fileId}`, {
      method: "DELETE",
    }),

  /**
   * Get a signed download URL for an attached project file.
   */
  getDownloadUrl: async (projectId: string, fileId: string): Promise<string> => {
    const res = await apiClient<{ download_url: string }>(
      `/api/projects/${projectId}/files/${fileId}`
    );
    if (!res?.download_url) {
      throw new Error("Failed to generate download URL");
    }
    return res.download_url;
  },
};

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectChat,
  ProjectFile,
} from "@/types/projects";
import { projectsApi } from "@/lib/api";

/**
 * Cache key for the sidebar projects list query.
 */
export const SIDEBAR_PROJECTS_QUERY_KEY = ["sidebar-projects"] as const;

/**
 * Custom hook to fetch and manage the user's projects list for the sidebar and workspace.
 * Provides in-memory cache helpers to optimistically add, update, and remove projects.
 *
 * @param options - Optional query configuration such as `enabled`.
 * @returns Query result containing the projects list and helper functions (`upsertProject`, `removeProject`).
 */
export function useSidebarProjects(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  const query = useQuery<{ projects: Project[] }>({
    queryKey: SIDEBAR_PROJECTS_QUERY_KEY,
    queryFn: async () => {
      try {
        return await projectsApi.list();
      } catch {
        return { projects: [] };
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });

  const projects = query.data?.projects ?? [];

  /**
   * Deterministically upserts a project into the local React Query cache.
   * Updates both the sidebar projects list and the individual project cache entry.
   *
   * @param project - Partial project object containing at least the project `id`.
   * @param options - Additional options, such as flagging the project as newly created (`isNew`).
   */
  const upsertProject = useCallback(
    (project: Partial<Project> & { id: string }, options?: { isNew?: boolean }) => {
      queryClient.setQueryData<{ projects: Project[] }>(
        SIDEBAR_PROJECTS_QUERY_KEY,
        (old) => {
          const list = old?.projects ?? [];
          const index = list.findIndex((p) => p.id === project.id);
          if (index === -1) {
            return {
              ...old,
              projects: [project as Project, ...list],
            };
          }
          const updated = [...list];
          updated[index] = {
            ...updated[index],
            ...project,
          };
          return {
            ...old,
            projects: updated,
          };
        }
      );

      queryClient.setQueryData(["project", project.id], (old: any) => {
        if (!old) {
          return {
            project: project as Project,
            chats: [],
            isNew: options?.isNew ?? false,
          };
        }
        return {
          ...old,
          project: { ...old.project, ...project },
          isNew: options?.isNew ?? old.isNew ?? false,
        };
      });

      if (options?.isNew) {
        queryClient.setQueryData(["project-files", project.id], []);
      }
    },
    [queryClient]
  );

  /**
   * Removes a project and its associated files from the local React Query cache.
   *
   * @param projectId - The unique identifier of the project to remove.
   */
  const removeProject = useCallback(
    (projectId: string) => {
      queryClient.setQueryData<{ projects: Project[] }>(
        SIDEBAR_PROJECTS_QUERY_KEY,
        (old) => {
          const list = old?.projects ?? [];
          return {
            ...old,
            projects: list.filter((p) => p.id !== projectId),
          };
        }
      );

      // Cancel in-flight queries first so no pending requests complete after delete
      void queryClient.cancelQueries({ queryKey: ["project", projectId] });
      void queryClient.cancelQueries({ queryKey: ["project-files", projectId] });

      // Provide null/empty data to active observers so they don't trigger an immediate 404 cache-miss refetch
      queryClient.setQueryData(["project", projectId], { project: null, chats: [] });
      queryClient.setQueryData(["project-files", projectId], { files: [] });
    },
    [queryClient]
  );

  return {
    ...query,
    projects,
    upsertProject,
    removeProject,
  };
}

/**
 * Mutation hook to create a new project.
 * Automatically inserts the newly created project into the sidebar query cache.
 *
 * @returns TanStack Query mutation object for project creation.
 */
export function useCreateProject() {
  const { upsertProject } = useSidebarProjects({ enabled: false });

  return useMutation<Project, Error, CreateProjectInput>({
    mutationFn: async (input: CreateProjectInput) => {
      const data = await projectsApi.create(input);
      return data.project;
    },
    onSuccess: (project) => {
      upsertProject(project, { isNew: true });
      toast.success("Project created successfully");
    },
    onError: (err: any) => {
      console.error("[useCreateProject] Error:", err);
      toast.error(err?.message || "Failed to create project");
    },
  });
}

/**
 * Mutation hook to update project metadata (e.g. name, instructions, visibility).
 * Optimistically updates both the sidebar projects cache and the individual project cache.
 * Automatically rolls back optimistic changes if the mutation fails.
 *
 * @returns TanStack Query mutation object for project updates.
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { upsertProject } = useSidebarProjects({ enabled: false });

  return useMutation<
    Project,
    Error,
    UpdateProjectInput & { id: string },
    { previousProjects?: { projects: Project[] }; previousProject?: any }
  >({
    mutationFn: async ({ id, ...patch }: UpdateProjectInput & { id: string }) => {
      const data = await projectsApi.update(id, patch);
      return (data.project || { id, ...patch }) as Project;
    },
    onMutate: async (updated) => {
      const previousProjects = queryClient.getQueryData<{ projects: Project[] }>(SIDEBAR_PROJECTS_QUERY_KEY);
      const previousProject = queryClient.getQueryData(["project", updated.id]);
      upsertProject(updated);
      return { previousProjects, previousProject };
    },
    onSuccess: (project) => {
      upsertProject(project);
    },
    onError: (err: any, updated, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(SIDEBAR_PROJECTS_QUERY_KEY, context.previousProjects);
      }
      if (context?.previousProject) {
        queryClient.setQueryData(["project", updated.id], context.previousProject);
      }
      console.error("[useUpdateProject] Error:", err);
      toast.error(err?.message || "Failed to update project");
    },
  });
}

/**
 * Mutation hook to delete a project by ID.
 * Optimistically removes the project from the sidebar and detail cache with automatic rollback.
 *
 * @returns TanStack Query mutation object for project deletion.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { removeProject } = useSidebarProjects({ enabled: false });

  return useMutation<
    string,
    Error,
    string,
    { previousProjects?: { projects: Project[] }; previousProject?: any }
  >({
    mutationFn: async (projectId: string) => {
      await projectsApi.delete(projectId);
      return projectId;
    },
    onMutate: async (projectId) => {
      const previousProjects = queryClient.getQueryData<{ projects: Project[] }>(SIDEBAR_PROJECTS_QUERY_KEY);
      const previousProject = queryClient.getQueryData(["project", projectId]);
      removeProject(projectId);
      return { previousProjects, previousProject };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["storageUsage"],
        refetchType: "none",
      });
      toast.success("Project deleted");
    },
    onError: (err: any, projectId, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(SIDEBAR_PROJECTS_QUERY_KEY, context.previousProjects);
      }
      if (context?.previousProject) {
        queryClient.setQueryData(["project", projectId], context.previousProject);
      }
      console.error("[useDeleteProject] Error:", err);
      toast.error(err?.message || "Failed to delete project");
    },
  });
}

/**
 * Custom TanStack Query hook to fetch a single project's details and associated chat threads.
 * Automatically deduplicates in-flight calls across AppShell, workspace pages, and PlaygroundChat.
 *
 * @param projectId - The unique identifier of the project, or null/undefined if none is selected.
 * @param options - Optional query configuration such as `enabled`.
 * @returns Query result containing `project` metadata, `chats` array, loading state, and refetch handler.
 */
export function useProject(projectId: string | null | undefined, options?: { enabled?: boolean }) {
  const query = useQuery<{ project: Project; chats: ProjectChat[] }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return { project: null as any, chats: [] };
      return await projectsApi.getById(projectId);
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    project: query.data?.project ?? null,
    chats: query.data?.chats ?? [],
  };
}

/**
 * Custom TanStack Query hook to fetch all files attached to a project workspace.
 * Caches files in memory with automatic deduplication across views.
 *
 * @param projectId - The unique identifier of the project, or null/undefined if none is selected.
 * @param options - Optional query configuration such as `enabled`.
 * @returns Query result containing the `files` array, loading state, and refetch handler.
 */
export function useProjectFiles(projectId: string | null | undefined, options?: { enabled?: boolean }) {
  const query = useQuery<{ files: ProjectFile[] }>({
    queryKey: ["project-files", projectId],
    queryFn: async () => {
      if (!projectId) return { files: [] };
      return await projectsApi.listFiles(projectId);
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    files: query.data?.files ?? [],
  };
}

/**
 * Mutation hook to upload a file to a project workspace.
 * Automatically inserts the uploaded file into the `["project-files", projectId]` query cache.
 *
 * @returns TanStack Query mutation object for uploading files.
 */
export function useUploadProjectFile() {
  const queryClient = useQueryClient();

  return useMutation<ProjectFile, Error, { projectId: string; file: File }>({
    mutationFn: async ({ projectId, file }) => {
      const data = await projectsApi.uploadFile(projectId, file);
      return data.file;
    },
    onSuccess: (uploadedFile, { projectId }) => {
      queryClient.setQueryData<{ files: ProjectFile[] }>(
        ["project-files", projectId],
        (old) => {
          const list = old?.files ?? [];
          return { files: [uploadedFile, ...list.filter((f) => f.id !== uploadedFile.id)] };
        }
      );
      // Invalidate storage usage so Data Controls reflects the new file size
      void queryClient.invalidateQueries({ queryKey: ["storageUsage"] });
    },
  });
}

/**
 * Mutation hook to delete a project file from storage and database.
 * Optimistically removes the file from `["project-files", projectId]` cache with automatic rollback.
 *
 * @returns TanStack Query mutation object for deleting project files.
 */
export function useDeleteProjectFile() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { projectId: string; fileId: string }, { previousFiles: any }>({
    mutationFn: async ({ projectId, fileId }) => {
      await projectsApi.deleteFile(projectId, fileId);
      return fileId;
    },
    onMutate: async ({ projectId, fileId }) => {
      await queryClient.cancelQueries({ queryKey: ["project-files", projectId] });
      const previousFiles = queryClient.getQueryData(["project-files", projectId]);

      queryClient.setQueryData<{ files: ProjectFile[] }>(
        ["project-files", projectId],
        (old) => {
          if (!old) return old;
          return { files: old.files.filter((f) => f.id !== fileId) };
        }
      );

      return { previousFiles };
    },
    onError: (err, { projectId }, context) => {
      if (context?.previousFiles) {
        queryClient.setQueryData(["project-files", projectId], context.previousFiles);
      }
      toast.error(err.message || "Failed to delete file");
    },
    onSuccess: () => {
      // Invalidate storage usage so Data Controls reflects the freed space
      void queryClient.invalidateQueries({ queryKey: ["storageUsage"] });
      toast.success("File deleted");
    },
  });
}

/**
 * Mutation hook to retrieve a signed download URL and open/download a project file.
 *
 * @returns TanStack Query mutation object for generating and downloading project file URLs.
 */
export function useDownloadProjectFile() {
  return useMutation<string, Error, { projectId: string; fileId: string }>({
    mutationFn: async ({ projectId, fileId }) => {
      return await projectsApi.getDownloadUrl(projectId, fileId);
    },
    onSuccess: (url) => {
      window.open(url, "_blank");
    },
    onError: (err) => {
      toast.error(err.message || "Download failed");
    },
  });
}

/**
 * Convenience mutation hook specifically for renaming a project.
 * Wraps `useUpdateProject` and provides optimistic cache updates for the project title.
 *
 * @returns TanStack Query mutation object for renaming projects.
 */
export function useRenameProject() {
  const updateProject = useUpdateProject();

  return useMutation<Project, Error, { id: string; name: string }>({
    mutationFn: async ({ id, name }) => {
      return updateProject.mutateAsync({ id, name });
    },
    onSuccess: () => {
      toast.success("Project renamed");
    },
    onError: (err: any) => {
      console.error("[useRenameProject] Error:", err);
      toast.error(err?.message || "Failed to rename project");
    },
  });
}

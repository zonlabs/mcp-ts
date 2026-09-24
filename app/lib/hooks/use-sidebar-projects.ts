import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import type { Project, CreateProjectInput, UpdateProjectInput, ProjectChat, ProjectFile } from "@/types/projects";

export const SIDEBAR_PROJECTS_QUERY_KEY = ["sidebar-projects"] as const;

export function useSidebarProjects(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  const query = useQuery<{ projects: Project[] }>({
    queryKey: SIDEBAR_PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) return { projects: [] };
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });

  const projects = query.data?.projects ?? [];

  /**
   * Deterministically upserts a project into the local React Query cache.
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
   * Removes a project from the local React Query cache.
   */
  const removeProject = useCallback(
    (projectId: string) => {
      queryClient.setQueryData<{ projects: Project[] }>(
        SIDEBAR_PROJECTS_QUERY_KEY,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            projects: old.projects.filter((p) => p.id !== projectId),
          };
        }
      );
      queryClient.removeQueries({ queryKey: ["project", projectId] });
      queryClient.removeQueries({ queryKey: ["project-files", projectId] });
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

export function useCreateProject() {
  const { upsertProject } = useSidebarProjects({ enabled: false });

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }
      return data.project as Project;
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

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { upsertProject } = useSidebarProjects({ enabled: false });

  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateProjectInput & { id: string }) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update project");
      }
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

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { removeProject } = useSidebarProjects({ enabled: false });

  return useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete project");
      }
      return projectId;
    },
    onMutate: async (projectId) => {
      const previousProjects = queryClient.getQueryData<{ projects: Project[] }>(SIDEBAR_PROJECTS_QUERY_KEY);
      const previousProject = queryClient.getQueryData(["project", projectId]);
      removeProject(projectId);
      return { previousProjects, previousProject };
    },
    onSuccess: () => {
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

export function useProject(projectId: string | null | undefined, options?: { enabled?: boolean }) {
  const query = useQuery<{ project: Project; chats: ProjectChat[] }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return { project: null as any, chats: [] };
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load project");
      }
      return res.json();
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

export function useProjectFiles(projectId: string | null | undefined, options?: { enabled?: boolean }) {
  const query = useQuery<{ files: ProjectFile[] }>({
    queryKey: ["project-files", projectId],
    queryFn: async () => {
      if (!projectId) return { files: [] };
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load project files");
      }
      return res.json();
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
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to upload ${file.name}`);
      }
      return data.file as ProjectFile;
    },
    onSuccess: (uploadedFile, { projectId }) => {
      queryClient.setQueryData<{ files: ProjectFile[] }>(
        ["project-files", projectId],
        (old) => {
          const list = old?.files ?? [];
          return { files: [uploadedFile, ...list.filter((f) => f.id !== uploadedFile.id)] };
        }
      );
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
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete file");
      }
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
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.download_url) {
        throw new Error(data.error || "Failed to generate download URL");
      }
      return data.download_url as string;
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
  });
}


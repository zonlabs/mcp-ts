import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { storageApi, chatsApi, mcpApi, projectsApi } from "@/lib/api";
import { SIDEBAR_CHATS_QUERY_KEY, useSidebarChats } from "@/lib/hooks/use-chats";
import { SIDEBAR_PROJECTS_QUERY_KEY } from "@/lib/hooks/use-projects";

export const STORAGE_USAGE_QUERY_KEY = ["storageUsage"] as const;
export const MCP_USAGE_QUERY_KEY = ["mcpUsage"] as const;

const FREE_TIER_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Hook to fetch user storage usage and quota allocation.
 */
export function useStorageUsage() {
  return useQuery({
    queryKey: STORAGE_USAGE_QUERY_KEY,
    queryFn: async () => {
      try {
        return await storageApi.getUsage();
      } catch {
        return {
          used_bytes: 0,
          limit_bytes: FREE_TIER_LIMIT_BYTES,
          file_count: 0,
        };
      }
    },
    staleTime: 60_000,
  });
}

/**
 * Hook to export conversations as a downloadable JSON archive.
 */
export function useExportChatsMutation() {
  return useMutation({
    mutationFn: (chatId?: string | void) => chatsApi.downloadExport(chatId || undefined),
    onSuccess: () => {
      toast.success("Chat export downloaded");
    },
    onError: (err: any) => {
      console.error("Export error:", err);
      toast.error(err?.message || "Failed to download chat export");
    },
  });
}

/**
 * Hook to update a chat's visibility (e.g. PUBLIC or PRIVATE).
 */
export function useUpdateChatVisibilityMutation() {
  const queryClient = useQueryClient();
  const { upsertChat } = useSidebarChats();

  return useMutation({
    mutationFn: ({
      chatId,
      visibility,
      chatTitle,
    }: {
      chatId: string;
      visibility: "PUBLIC" | "PRIVATE";
      chatTitle?: string | null;
    }) => chatsApi.updateVisibility(chatId, visibility),
    onSuccess: (_, { chatId, visibility, chatTitle }) => {
      upsertChat({ id: chatId, visibility });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      if (visibility === "PRIVATE") {
        toast.success(`Share link revoked for "${chatTitle || "Untitled"}"`);
      } else {
        toast.success(`Chat marked as public`);
      }
    },
    onError: (err: any) => {
      console.error("Update visibility error:", err);
      toast.error(err?.message || "Failed to update visibility");
    },
  });
}

/**
 * Hook to revoke all public shared links.
 */
export function useRevokeAllSharedMutation(sharedChatIds: string[]) {
  const queryClient = useQueryClient();
  const { upsertChat } = useSidebarChats();

  return useMutation({
    mutationFn: () => chatsApi.revokeAllShared(),
    onSuccess: () => {
      sharedChatIds.forEach((id) => {
        upsertChat({ id, visibility: "PRIVATE" });
      });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      toast.success("All shared links revoked");
    },
    onError: (err: any) => {
      console.error("Revoke all error:", err);
      toast.error(err?.message || "Failed to revoke all share links");
    },
  });
}

/**
 * Hook to delete all conversations.
 */
export function useDeleteAllChatsMutation() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chatsApi.deleteAll(),
    onSuccess: () => {
      queryClient.setQueryData(SIDEBAR_CHATS_QUERY_KEY, { chats: [] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      toast.success("All conversations permanently deleted");
      router.push("/chat");
    },
    onError: (err: any) => {
      console.error("Delete all chats error:", err);
      toast.error(err?.message || "Failed to delete conversations");
    },
  });
}

/**
 * Hook to delete MCP usage & telemetry events.
 */
export function useDeleteMcpUsageEventsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => mcpApi.deleteUsageEvents(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MCP_USAGE_QUERY_KEY });
      toast.success("MCP usage events permanently deleted");
    },
    onError: (err: any) => {
      console.error("Delete MCP usage events error:", err);
      toast.error(err?.message || "Failed to delete MCP usage events");
    },
  });
}

/**
 * Hook to delete all projects and purge all their attached storage files.
 */
export function useDeleteAllProjectsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => projectsApi.deleteAll(),
    onSuccess: () => {
      queryClient.setQueryData(SIDEBAR_PROJECTS_QUERY_KEY, { projects: [] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_PROJECTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: STORAGE_USAGE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      toast.success("All projects and attached files permanently deleted");
    },
    onError: (err: any) => {
      console.error("Delete all projects error:", err);
      toast.error(err?.message || "Failed to delete projects");
    },
  });
}

/**
 * Hook to delete all attached project files, clearing storage usage.
 */
export function useDeleteAllFilesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => storageApi.deleteAllFiles(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORAGE_USAGE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["project-files"] });
      toast.success("All files deleted. Storage space cleared.");
    },
    onError: (err: any) => {
      console.error("Delete all files error:", err);
      toast.error(err?.message || "Failed to delete files");
    },
  });
}

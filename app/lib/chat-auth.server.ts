import type { SupabaseClient, User } from '@supabase/supabase-js';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatRecord {
  id: string;
  title?: string | null;
  user_id: string;
  project_id?: string | null;
  visibility?: string | null;
}

export interface ChatAccessResult {
  chat: ChatRecord | null;
  isOwner: boolean;
  collaboratorRole: 'viewer' | 'editor' | null;
  canView: boolean;
  canEdit: boolean;
  isReadOnly: boolean;
}

/**
 * Resolves permissions and read-only status for a chat.
 * 
 * Rules:
 * - Owner: full view & edit access.
 * - Editor (via chat_shares or project_shares): view & edit access.
 * - Viewer: view-only (read-only).
 * - Public chat (non-collaborator or anonymous): view-only (read-only).
 * - Private chat (non-collaborator): access denied (canView: false).
 */
export async function resolveChatAccess(
  supabase: SupabaseClient,
  chatId: string,
  user?: User | { id: string; email?: string | null } | null
): Promise<ChatAccessResult> {
  const { data: chat } = await supabase
    .from('chats')
    .select('id, title, user_id, project_id, visibility')
    .eq('id', chatId)
    .maybeSingle();

  if (!chat) {
    return {
      chat: null,
      isOwner: false,
      collaboratorRole: null,
      canView: false,
      canEdit: false,
      isReadOnly: false,
    };
  }

  const isOwner = Boolean(user && chat.user_id === user.id);
  if (isOwner) {
    return {
      chat,
      isOwner: true,
      collaboratorRole: null,
      canView: true,
      canEdit: true,
      isReadOnly: false,
    };
  }

  let collaboratorRole: 'viewer' | 'editor' | null = null;
  const userEmail = user?.email?.toLowerCase();

  if (userEmail) {
    const { data: share } = await supabase
      .from('chat_shares')
      .select('role')
      .eq('chat_id', chatId)
      .ilike('email', userEmail)
      .maybeSingle();

    if (share?.role) {
      collaboratorRole = share.role as 'viewer' | 'editor';
    } else if (chat.project_id) {
      const { data: projShare } = await supabase
        .from('project_shares')
        .select('role')
        .eq('project_id', chat.project_id)
        .ilike('email', userEmail)
        .maybeSingle();

      if (projShare?.role) {
        collaboratorRole = projShare.role as 'viewer' | 'editor';
      }
    }
  }

  if (collaboratorRole === 'editor') {
    return {
      chat,
      isOwner: false,
      collaboratorRole: 'editor',
      canView: true,
      canEdit: true,
      isReadOnly: false,
    };
  }

  if (collaboratorRole === 'viewer') {
    return {
      chat,
      isOwner: false,
      collaboratorRole: 'viewer',
      canView: true,
      canEdit: false,
      isReadOnly: true,
    };
  }

  const isPublic = chat.visibility === 'PUBLIC';
  return {
    chat,
    isOwner: false,
    collaboratorRole: null,
    canView: isPublic,
    canEdit: false,
    isReadOnly: true,
  };
}

/**
 * Checks whether a user has owner or editor permissions for a given project.
 */
export async function hasProjectEditAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId?: string | null,
  userEmail?: string | null
): Promise<boolean> {
  if (!UUID_REGEX.test(projectId)) return false;

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) return false;
  if (userId && project.user_id === userId) return true;

  if (userEmail) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('role')
      .eq('project_id', projectId)
      .ilike('email', userEmail.toLowerCase())
      .maybeSingle();

    return share?.role === 'editor';
  }

  return false;
}

/**
 * Safely resolves the project ID to bind to a chat, ensuring unauthorized
 * query params cannot link arbitrary projects.
 */
export async function resolveEffectiveProjectId(
  supabase: SupabaseClient,
  existingProjectId?: string | null,
  requestedProjectId?: string | null,
  user?: User | { id: string; email?: string | null } | null
): Promise<string | undefined> {
  if (existingProjectId) return existingProjectId;
  if (!requestedProjectId || !user) return undefined;

  const canEdit = await hasProjectEditAccess(
    supabase,
    requestedProjectId,
    user.id,
    user.email
  );

  return canEdit ? requestedProjectId : undefined;
}

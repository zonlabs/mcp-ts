import { createClient } from '@/lib/supabase/server';

import type {
  MemoryScope,
  ProjectVisibility,
  ProjectRole,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectChat,
  ProjectFile,
  ProjectShare,
  UploadingFileItem,
} from '@/types/projects';

export type {
  MemoryScope,
  ProjectVisibility,
  ProjectRole,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectChat,
  ProjectFile,
  ProjectShare,
  UploadingFileItem,
};

/**
 * Lists projects accessible to the user with optional search and tab filtering.
 */
export async function getUserProjects(
  userId: string,
  options?: {
    search?: string;
    filter?: 'all' | 'created' | 'shared';
  }
): Promise<Project[]> {
  const supabase = await createClient();
  const filter = options?.filter || 'all';

  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = user?.email?.toLowerCase();

  // Find project IDs shared directly with user's email
  let sharedProjectIds: string[] = [];
  if (userEmail) {
    const { data: shares } = await supabase
      .from('project_shares')
      .select('project_id')
      .ilike('email', userEmail);
    if (shares && shares.length > 0) {
      sharedProjectIds = shares.map((s) => s.project_id);
    }
  }

  let query = supabase.from('projects').select('*');

  if (filter === 'created') {
    query = query.eq('user_id', userId);
  } else if (filter === 'shared') {
    if (sharedProjectIds.length > 0) {
      query = query.in('id', sharedProjectIds);
    } else {
      return [];
    }
  } else {
    // 'all' includes own projects or projects explicitly shared directly with user (via project_shares)
    if (sharedProjectIds.length > 0) {
      query = query.or(`user_id.eq.${userId},id.in.(${sharedProjectIds.join(',')})`);
    } else {
      query = query.eq('user_id', userId);
    }
  }

  if (options?.search?.trim()) {
    const q = `%${options.search.trim()}%`;
    query = query.or(`name.ilike.${q},description.ilike.${q}`);
  }

  query = query.order('is_pinned', { ascending: false }).order('updated_at', { ascending: false });

  const { data: projects, error } = await query;
  if (error) throw error;
  if (!projects || projects.length === 0) return [];

  // Fetch chat counts for each project
  const projectIds = projects.map((p) => p.id);
  const { data: chatCounts } = await supabase
    .from('chats')
    .select('project_id')
    .in('project_id', projectIds);

  const countMap: Record<string, number> = {};
  if (chatCounts) {
    for (const row of chatCounts) {
      if (row.project_id) {
        countMap[row.project_id] = (countMap[row.project_id] || 0) + 1;
      }
    }
  }

  // Fetch all collaborator shares for these projects
  const { data: sharesData } = await supabase
    .from('project_shares')
    .select('project_id, email, role')
    .in('project_id', projectIds);

  const sharesCountMap: Record<string, number> = {};
  const userRoleMap: Record<string, 'editor' | 'viewer'> = {};

  if (sharesData) {
    for (const s of sharesData) {
      sharesCountMap[s.project_id] = (sharesCountMap[s.project_id] || 0) + 1;
      if (userEmail && s.email.toLowerCase() === userEmail) {
        userRoleMap[s.project_id] = s.role as 'editor' | 'viewer';
      }
    }
  }

  return projects.map((p) => {
    const isOwner = p.user_id === userId;
    const sharesCount = sharesCountMap[p.id] || 0;
    const role: 'owner' | 'editor' | 'viewer' = isOwner
      ? 'owner'
      : userRoleMap[p.id] || 'viewer';
    const isShared = p.visibility === 'PUBLIC' || sharesCount > 0 || !isOwner;

    return {
      ...p,
      chat_count: countMap[p.id] || 0,
      shares_count: sharesCount,
      role,
      is_shared: isShared,
    };
  });
}

/**
 * Retrieves a single project by ID.
 */
export async function getProjectById(
  projectId: string,
  userId?: string
): Promise<Project | null> {
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !project) return null;

  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = user?.email?.toLowerCase();

  // Fetch collaborator shares for this project
  const { data: sharesData } = await supabase
    .from('project_shares')
    .select('email, role')
    .eq('project_id', projectId);

  const sharesCount = sharesData?.length || 0;
  let userRole: 'owner' | 'editor' | 'viewer' = 'viewer';
  const isOwner = Boolean(userId && project.user_id === userId);

  if (isOwner) {
    userRole = 'owner';
  } else if (userEmail && sharesData) {
    const matched = sharesData.find((s) => s.email.toLowerCase() === userEmail);
    if (matched) {
      userRole = matched.role as 'editor' | 'viewer';
    }
  }

  // Check access: must be owner, collaborator, or public
  if (!isOwner && userRole === 'viewer' && project.visibility !== 'PUBLIC') {
    const isCollaborator = sharesData?.some((s) => userEmail && s.email.toLowerCase() === userEmail);
    if (!isCollaborator) {
      return null;
    }
  }

  // Get chat count
  const { count } = await supabase
    .from('chats')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const isShared = project.visibility === 'PUBLIC' || sharesCount > 0 || !isOwner;

  return {
    ...project,
    chat_count: count || 0,
    shares_count: sharesCount,
    role: userRole,
    is_shared: isShared,
  };
}

/**
 * Creates a new project.
 */
export async function createProject(
  userId: string,
  input: CreateProjectInput
): Promise<Project> {
  const supabase = await createClient();

  const insertData = {
    user_id: userId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    custom_instructions: input.custom_instructions?.trim() || null,
    memory_scope: input.memory_scope || 'global',
    is_pinned: Boolean(input.is_pinned),
    visibility: input.visibility || 'PRIVATE',
    metadata: input.metadata || {},
  };

  const { data, error } = await supabase
    .from('projects')
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return { ...data, chat_count: 0 };
}

/**
 * Updates an existing project.
 */
export async function updateProject(
  projectId: string,
  userId: string,
  input: UpdateProjectInput
): Promise<Project> {
  const supabase = await createClient();

  const updateData: Record<string, any> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.description !== undefined) updateData.description = input.description?.trim() || null;
  if (input.custom_instructions !== undefined) updateData.custom_instructions = input.custom_instructions?.trim() || null;
  if (input.memory_scope !== undefined) updateData.memory_scope = input.memory_scope;
  if (input.is_pinned !== undefined) updateData.is_pinned = input.is_pinned;
  if (input.visibility !== undefined) updateData.visibility = input.visibility;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;

  const { data, error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Deletes a project. Associated chats will have their project_id set to null.
 */
export async function deleteProject(
  projectId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Gets all chats associated with a project.
 */
export async function getProjectChats(
  projectId: string,
  userId?: string
): Promise<ProjectChat[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chats')
    .select('id, title, visibility, is_pinned, created_at, updated_at')
    .eq('project_id', projectId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Gets all files attached to a project.
 */
export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

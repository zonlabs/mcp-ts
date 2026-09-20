import { createClient } from '@/lib/supabase/server';

export type MemoryScope = 'global' | 'project';
export type ProjectVisibility = 'PRIVATE' | 'PUBLIC';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  custom_instructions: string | null;
  is_pinned: boolean;
  visibility: ProjectVisibility;
  memory_scope: MemoryScope;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  chat_count?: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  custom_instructions?: string | null;
  memory_scope?: MemoryScope;
  is_pinned?: boolean;
  visibility?: ProjectVisibility;
  metadata?: Record<string, any>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  custom_instructions?: string | null;
  memory_scope?: MemoryScope;
  is_pinned?: boolean;
  visibility?: ProjectVisibility;
  metadata?: Record<string, any>;
}

export interface ProjectChat {
  id: string;
  title: string | null;
  visibility: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  storage_path: string;
  content: string | null;
  created_at: string;
  updated_at: string;
}

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

  let query = supabase.from('projects').select('*');

  if (filter === 'created') {
    query = query.eq('user_id', userId);
  } else if (filter === 'shared') {
    query = query.neq('user_id', userId).eq('visibility', 'PUBLIC');
  } else {
    // 'all' includes own projects or public projects
    query = query.or(`user_id.eq.${userId},visibility.eq.PUBLIC`);
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

  return projects.map((p) => ({
    ...p,
    chat_count: countMap[p.id] || 0,
  }));
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

  // Check access: must be owner or public
  if (userId && project.user_id !== userId && project.visibility !== 'PUBLIC') {
    return null;
  }

  // Get chat count
  const { count } = await supabase
    .from('chats')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  return {
    ...project,
    chat_count: count || 0,
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
  userId: string
): Promise<ProjectChat[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chats')
    .select('id, title, visibility, is_pinned, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
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

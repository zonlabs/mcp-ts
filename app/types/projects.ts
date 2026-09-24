/**
 * Centralized Type Definitions for Projects, Project Files, and Sharing.
 * @module types/projects
 */

/**
 * Memory scope for project-level vs global chat memories.
 */
export type MemoryScope = 'global' | 'project';

/**
 * Project privacy and access visibility.
 */
export type ProjectVisibility = 'PRIVATE' | 'PUBLIC';

/**
 * Collaborator roles on a shared project.
 */
export type ProjectRole = 'owner' | 'editor' | 'viewer';

/**
 * Core Project entity model.
 */
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
  is_shared?: boolean;
  shares_count?: number;
  role?: ProjectRole;
}

/**
 * Payload for creating a new project.
 */
export interface CreateProjectInput {
  name: string;
  description?: string | null;
  custom_instructions?: string | null;
  memory_scope?: MemoryScope;
  is_pinned?: boolean;
  visibility?: ProjectVisibility;
  metadata?: Record<string, any>;
}

/**
 * Payload for updating an existing project (e.g., renaming, instructions, visibility).
 */
export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  custom_instructions?: string | null;
  memory_scope?: MemoryScope;
  is_pinned?: boolean;
  visibility?: ProjectVisibility;
  metadata?: Record<string, any>;
}

/**
 * Chat thread associated with a project.
 */
export interface ProjectChat {
  id: string;
  title: string | null;
  visibility: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Uploaded file attached to a project workspace.
 */
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
 * Collaborator share record for a project.
 */
export interface ProjectShare {
  id: string;
  project_id: string;
  email: string;
  role: 'editor' | 'viewer';
  created_at: string;
}

/**
 * Ephemeral client state for files actively being uploaded.
 */
export interface UploadingFileItem {
  tempId: string;
  name: string;
  size: number;
  status: 'uploading' | 'error';
  errorMessage?: string;
}

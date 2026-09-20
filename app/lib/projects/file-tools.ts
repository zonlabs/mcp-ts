import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Creates AI SDK tools for inspecting files attached to a project.
 */
export function createProjectFileTools(projectId: string) {
  return {
    list_project_files: tool({
      description:
        'List all knowledge and documentation files attached to the current project.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const supabase = await createClient();
          const { data: files, error } = await supabase
            .from('project_files')
            .select('id, name, size_bytes, mime_type, created_at')
            .eq('project_id', projectId)
            .order('name', { ascending: true });

          if (error) {
            return { error: `Failed to list files: ${error.message}`, files: [] };
          }

          if (!files || files.length === 0) {
            return {
              message: 'No files are attached to this project.',
              files: [],
            };
          }

          return {
            files: files.map((f) => ({
              name: f.name,
              sizeBytes: f.size_bytes,
              type: f.mime_type,
            })),
          };
        } catch (err: any) {
          return { error: err?.message || 'Error listing project files', files: [] };
        }
      },
    }),

    read_project_file: tool({
      description:
        'Read the text content of a specific file attached to the current project.',
      inputSchema: z.object({
        filename: z
          .string()
          .describe('The exact or partial name of the project file to read (e.g., "schema.sql", "api.md").'),
      }),
      execute: async ({ filename }) => {
        try {
          const supabase = await createClient();

          // Try exact match first, then ilike match
          let { data: file, error } = await supabase
            .from('project_files')
            .select('name, size_bytes, mime_type, content, storage_path')
            .eq('project_id', projectId)
            .ilike('name', filename.trim())
            .maybeSingle();

          if (!file) {
            const { data: fuzzyFiles } = await supabase
              .from('project_files')
              .select('name, size_bytes, mime_type, content, storage_path')
              .eq('project_id', projectId)
              .ilike('name', `%${filename.trim()}%`)
              .limit(1);

            if (fuzzyFiles && fuzzyFiles.length > 0) {
              file = fuzzyFiles[0];
            }
          }

          if (!file) {
            return {
              error: `File "${filename}" not found in this project. Use list_project_files to see available files.`,
            };
          }

          if (file.content) {
            return {
              name: file.name,
              sizeBytes: file.size_bytes,
              type: file.mime_type,
              content: file.content,
            };
          }

          // If content was not pre-extracted, download from storage and read text
          const { data: downloadData, error: downloadError } = await supabase.storage
            .from('project-files')
            .download(file.storage_path);

          if (downloadError || !downloadData) {
            return {
              error: `File "${file.name}" is a binary file or its content cannot be downloaded.`,
            };
          }

          const text = await downloadData.text();
          return {
            name: file.name,
            sizeBytes: file.size_bytes,
            type: file.mime_type,
            content: text,
          };
        } catch (err: any) {
          return {
            error: err?.message || `Failed to read file "${filename}".`,
          };
        }
      },
    }),
  };
}

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

function getMediaType(filename: string, mimeType?: string | null): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

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
        'Read the content of a specific file attached to the current project (text, code, documentation, PDF, or image).',
      inputSchema: z.object({
        filename: z
          .string()
          .describe('The exact or partial name of the project file to read (e.g., "schema.sql", "api.md", "invoice.pdf").'),
      }),
      execute: async ({ filename }) => {
        try {
          const supabase = await createClient();
          const target = filename.trim();

          // Try exact match first, then fuzzy match
          let { data: file } = await supabase
            .from('project_files')
            .select('name, size_bytes, mime_type, content, storage_path')
            .eq('project_id', projectId)
            .ilike('name', target)
            .maybeSingle();

          if (!file) {
            const { data: fuzzyFiles } = await supabase
              .from('project_files')
              .select('name, size_bytes, mime_type, content, storage_path')
              .eq('project_id', projectId)
              .ilike('name', `%${target}%`)
              .limit(1);

            file = fuzzyFiles?.[0] ?? null;
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
              type: file.mime_type || 'text/plain',
              content: file.content,
            };
          }

          // If content was not pre-extracted, download from storage
          const { data: downloadData, error: downloadError } = await supabase.storage
            .from('project-files')
            .download(file.storage_path);

          if (downloadError || !downloadData) {
            return {
              error: `File "${file.name}" cannot be downloaded from storage.`,
            };
          }

          const arrayBuffer = await downloadData.arrayBuffer();
          return {
            name: file.name,
            sizeBytes: file.size_bytes,
            type: getMediaType(file.name, file.mime_type),
            base64: Buffer.from(arrayBuffer).toString('base64'),
          };
        } catch (err: any) {
          return {
            error: err?.message || `Failed to read file "${filename}".`,
          };
        }
      },
      toModelOutput: ({ output }: { output: any }) => {
        if (output?.error) {
          return {
            type: 'content',
            value: [{ type: 'text', text: output.error }],
          };
        }
        if (output?.base64) {
          return {
            type: 'content',
            value: [
              {
                type: 'file',
                mediaType: output.type || 'application/pdf',
                data: { type: 'data', data: output.base64 },
              },
            ],
          };
        }
        return {
          type: 'content',
          value: [{ type: 'text', text: output?.content || `File "${output?.name || ''}" is empty.` }],
        };
      },
    }),
  };
}

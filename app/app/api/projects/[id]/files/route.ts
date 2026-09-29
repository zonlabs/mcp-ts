import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProjectFiles } from '@/lib/projects';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'sql', 'ts', 'tsx',
  'js', 'jsx', 'py', 'html', 'css', 'scss', 'yml', 'yaml', 'xml',
  'env', 'example', 'log', 'sh', 'bash', 'zsh', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'toml', 'ini', 'cfg', 'conf'
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function isTextFile(filename: string, mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  if (mimeType === 'application/json' || mimeType === 'application/xml') return true;
  const ext = filename.split('.').pop()?.toLowerCase();
  return Boolean(ext && TEXT_EXTENSIONS.has(ext));
}

/**
 * GET /api/projects/:id/files
 * Returns all files attached to this project.
 */
export async function GET(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const files = await getProjectFiles(projectId);
    return NextResponse.json({ files });
  } catch (error: any) {
    console.error('[API /api/projects/:id/files] GET error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to list project files' }, { status: 500 });
  }
}

/**
 * POST /api/projects/:id/files
 * Handles multipart file upload to Supabase Storage and records metadata + content in PostgreSQL.
 */
export async function POST(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Verify project access
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, user_id, visibility')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.user_id !== user.id) {
    return NextResponse.json({ error: 'Only the project owner can upload files' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds maximum allowed limit of 10MB' },
        { status: 400 }
      );
    }

    // Check cumulative user storage quota (500 MB free tier limit)
    const MAX_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;
    const { data: userFiles } = await supabase
      .from('project_files')
      .select('size_bytes')
      .eq('user_id', user.id);

    const currentTotalBytes = (userFiles || []).reduce((acc, f) => acc + (f.size_bytes || 0), 0);
    if (currentTotalBytes + file.size > MAX_STORAGE_QUOTA_BYTES) {
      return NextResponse.json(
        { error: 'Storage quota exceeded (500 MB limit). Please delete files to free up space.' },
        { status: 403 }
      );
    }

    // 2. Read content if readable text
    let content: string | null = null;
    const isText = isTextFile(file.name, file.type);
    if (isText) {
      try {
        content = await file.text();
      } catch (err) {
        console.warn(`[ProjectFiles] Failed to read text content for ${file.name}:`, err);
      }
    }

    // 3. Upload raw file to Supabase storage bucket 'project-files'
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${projectId}/${crypto.randomUUID()}-${cleanFileName}`;
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[ProjectFiles] Storage upload error:', uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 4. Record file in public.project_files
    const { data: fileRecord, error: dbError } = await supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        user_id: user.id,
        name: file.name,
        size_bytes: file.size,
        mime_type: file.type || 'application/octet-stream',
        storage_path: storagePath,
        content,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[ProjectFiles] Database insert error:', dbError);
      // Clean up uploaded file from storage on DB failure
      await supabase.storage.from('project-files').remove([storagePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ file: fileRecord }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/projects/:id/files] POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to upload project file' },
      { status: 500 }
    );
  }
}

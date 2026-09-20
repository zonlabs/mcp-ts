import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type RouteContext = {
  params: Promise<{ id: string; fileId: string }>;
};

/**
 * GET /api/projects/:id/files/:fileId
 * Generates a signed download URL or returns the file metadata.
 */
export async function GET(req: Request, context: RouteContext) {
  const { id: projectId, fileId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: file, error: dbError } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .single();

    if (dbError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Generate signed download URL (valid for 1 hour)
    const { data: signedUrlData, error: storageError } = await supabase.storage
      .from('project-files')
      .createSignedUrl(file.storage_path, 3600);

    if (storageError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate download URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      file,
      download_url: signedUrlData.signedUrl,
    });
  } catch (error: any) {
    console.error('[API /api/projects/:id/files/:fileId] GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/:id/files/:fileId
 * Deletes the file from storage and database.
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id: projectId, fileId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Fetch file record to verify permissions and get storage path
    const { data: file, error: dbFetchError } = await supabase
      .from('project_files')
      .select('id, storage_path, user_id')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .single();

    if (dbFetchError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (file.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to delete this file' }, { status: 403 });
    }

    // 2. Remove file from Supabase storage bucket
    if (file.storage_path) {
      const { error: storageRemoveError } = await supabase.storage
        .from('project-files')
        .remove([file.storage_path]);

      if (storageRemoveError) {
        console.warn('[ProjectFiles] Storage file removal warning:', storageRemoveError);
      }
    }

    // 3. Remove row from database
    const { error: deleteError } = await supabase
      .from('project_files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'File deleted successfully' });
  } catch (error: any) {
    console.error('[API /api/projects/:id/files/:fileId] DELETE error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete file' },
      { status: 500 }
    );
  }
}

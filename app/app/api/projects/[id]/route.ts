import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProjectById, updateProject, deleteProject, getProjectChats } from '@/lib/projects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/:id
 * Returns project details along with its chats.
 */
export async function GET(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const project = await getProjectById(projectId, user.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const chats = await getProjectChats(projectId, user.id);

    return NextResponse.json({ project, chats });
  } catch (error: any) {
    console.error(`[API /api/projects/${projectId}] GET error:`, error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch project' }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/:id
 * Updates project details (name, description, instructions, memory_scope, is_pinned, visibility).
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updated = await updateProject(projectId, user.id, body);
    return NextResponse.json({ project: updated });
  } catch (error: any) {
    console.error(`[API /api/projects/${projectId}] PATCH error:`, error);
    return NextResponse.json({ error: error?.message || 'Failed to update project' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/:id
 * Deletes a project. Associated chats remain safe (their project_id is set to null).
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await deleteProject(projectId, user.id);
    return NextResponse.json({ success: true, message: 'Project deleted' });
  } catch (error: any) {
    console.error(`[API /api/projects/${projectId}] DELETE error:`, error);
    return NextResponse.json({ error: error?.message || 'Failed to delete project' }, { status: 500 });
  }
}

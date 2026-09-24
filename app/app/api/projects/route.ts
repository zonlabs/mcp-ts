import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserProjects, createProject } from '@/lib/projects';

/**
 * GET /api/projects?search=...&filter=all|created|shared
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || undefined;
  const filter = (searchParams.get('filter') as 'all' | 'created' | 'shared') || 'all';

  try {
    const projects = await getUserProjects(user.id, { search, filter });
    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('[API /api/projects] GET error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to list projects' }, { status: 500 });
  }
}

/**
 * POST /api/projects
 * Body: { name, description, custom_instructions, memory_scope, is_pinned, visibility }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const memoryScope = body.memory_scope || 'global';

    const project = await createProject(user.id, {
      name: body.name,
      description: body.description,
      custom_instructions: body.custom_instructions,
      memory_scope: memoryScope,
      is_pinned: body.is_pinned,
      visibility: body.visibility,
      metadata: body.metadata,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/projects] POST error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create project' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects?all=true
 * Bulk delete all projects for the authenticated user, purging attached storage files.
 */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === 'true';

  if (!all) {
    return NextResponse.json({ error: 'Missing all=true parameter' }, { status: 400 });
  }

  try {
    const { deleteAllProjects } = await import('@/lib/projects');
    await deleteAllProjects(user.id);
    return NextResponse.json({ success: true, message: 'All projects deleted' });
  } catch (error: any) {
    console.error('[API /api/projects] DELETE all error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete projects' }, { status: 500 });
  }
}

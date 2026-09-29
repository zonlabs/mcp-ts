import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllMemories, addMemories, deleteMemory, deleteAllMemories } from '@/lib/memory/mem0';

/**
 * GET /api/memories
 * Lists all long-term memories for the authenticated user.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const memories = await getAllMemories(user.id);
    return NextResponse.json({ memories });
  } catch (error: any) {
    console.error('[API /api/memories] GET error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch memories' }, { status: 500 });
  }
}

/**
 * POST /api/memories
 * Manually adds a new memory for the authenticated user.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const fact = typeof body?.fact === 'string' ? body.fact.trim() : '';

    if (!fact) {
      return NextResponse.json({ error: 'Fact content is required' }, { status: 400 });
    }

    await addMemories(fact, {
      userId: user.id,
      metadata: {
        category: body?.category || 'manual_entry',
        source: 'manual',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/memories] POST error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to add memory' }, { status: 500 });
  }
}

/**
 * DELETE /api/memories?id=... or /api/memories?all=true
 * Deletes a single memory or clears all memories for the authenticated user.
 */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const memoryId = searchParams.get('id');
  const deleteAll = searchParams.get('all') === 'true';

  try {
    if (deleteAll) {
      await deleteAllMemories(user.id);
      return NextResponse.json({ success: true, message: 'All memories deleted' });
    }

    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID is required' }, { status: 400 });
    }

    await deleteMemory(memoryId);
    return NextResponse.json({ success: true, message: 'Memory deleted' });
  } catch (error: any) {
    console.error('[API /api/memories] DELETE error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete memory' }, { status: 500 });
  }
}

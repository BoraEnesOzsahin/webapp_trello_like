import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase client unavailable' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin.from('workspaces').select('data').eq('user_id', userId).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as any;
  return NextResponse.json(row?.data ?? null);
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase client unavailable' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { userId, workspace } = body;

    if (!userId || !workspace) {
      return NextResponse.json({ error: 'userId and workspace required' }, { status: 400 });
    }

    // If teamId exists, save to shared_workspaces table (shared team workspace)
    if (workspace.teamId && workspace.isShared) {
      const sharedPayload = {
        id: workspace.teamId,
        name: workspace.teamName || 'Team Workspace',
        created_by: workspace.ownerId || userId,
        data: workspace,
        updated_at: new Date().toISOString(),
      } as any;

      const { error: sharedError } = await supabaseAdmin
        .from('shared_workspaces')
        .upsert(sharedPayload, { onConflict: 'id' });

      if (sharedError) {
        return NextResponse.json({ error: sharedError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, workspace: 'shared' });
    }

    // Otherwise save to personal workspaces table
    const payload = {
      user_id: userId,
      data: workspace,
      updated_at: new Date().toISOString(),
    } as any;

    const { error } = await supabaseAdmin.from('workspaces').upsert(payload, { onConflict: 'user_id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, workspace: 'personal' });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

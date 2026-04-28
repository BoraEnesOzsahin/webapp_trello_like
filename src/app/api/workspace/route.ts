import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  try {
    // First try to fetch personal workspace
    const { data: personalData, error: personalError } = await supabaseAdmin
      .from('workspaces')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    if (personalError && personalError.code !== 'PGRST116') {
      return NextResponse.json({ error: personalError.message }, { status: 500 });
    }

    // Then fetch shared workspaces where user is listed in workspace_members
    const { data: membershipRows, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId);

    if (membershipError) {
      console.error('Workspace membership fetch error:', membershipError);
      return NextResponse.json((personalData as any)?.data ?? null);
    }

    const workspaceIds = (membershipRows ?? []).map((row: any) => row.workspace_id);

    let sharedWorkspace: any = null;
    if (workspaceIds.length > 0) {
      const { data: sharedData, error: sharedError } = await supabaseAdmin
        .from('shared_workspaces')
        .select('data')
        .in('id', workspaceIds)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sharedError) {
        console.error('Shared workspace fetch error:', sharedError);
      } else {
        sharedWorkspace = (sharedData as any)?.data ?? null;
      }
    }

    // Return personal workspace if available, otherwise first shared workspace
    const personalWorkspace = (personalData as any)?.data ?? null;

    return NextResponse.json(personalWorkspace ?? sharedWorkspace);
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
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

      const members = Array.isArray(workspace.members) ? workspace.members : [];
      const memberRows = members
        .filter((member: any) => typeof member?.userId === 'string' && UUID_PATTERN.test(member.userId))
        .map((member: any) => ({
          workspace_id: workspace.teamId,
          user_id: member.userId,
          role: member.role === 'admin' ? 'admin' : 'member',
          joined_at: member.joinedAt || new Date().toISOString(),
        }));

      if (memberRows.length > 0) {
        const { error: memberUpsertError } = await supabaseAdmin
          .from('workspace_members')
          .upsert(memberRows, { onConflict: 'workspace_id,user_id' });

        if (memberUpsertError) {
          return NextResponse.json({ error: memberUpsertError.message }, { status: 500 });
        }
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

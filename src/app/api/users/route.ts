import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

type UserRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
};

function ensureSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase client unavailable' }, { status: 500 });
  }

  return null;
}

export async function GET(req: Request) {
  const guard = ensureSupabase();
  if (guard) {
    return guard;
  }

  const client = supabaseAdmin as any;

  const url = new URL(req.url);
  const email = url.searchParams.get('email')?.trim().toLowerCase();
  const userId = url.searchParams.get('id')?.trim();

  if (!email && !userId) {
    return NextResponse.json({ error: 'email or id query is required' }, { status: 400 });
  }

  let query = client.from('users').select('id, email, username, created_at').limit(1);
  query = email ? query.eq('email', email) : query.eq('id', userId!);

  const { data, error } = await query.maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function POST(req: Request) {
  const guard = ensureSupabase();
  if (guard) {
    return guard;
  }

  const client = supabaseAdmin as any;

  try {
    const body = await req.json();
    const mode = body?.mode as 'signup' | 'login' | undefined;

    if (mode === 'signup') {
      const username = String(body?.username ?? '').trim();
      const email = String(body?.email ?? '').trim().toLowerCase();
      const passwordHash = String(body?.passwordHash ?? '').trim();

      if (!username || !email || !passwordHash) {
        return NextResponse.json({ error: 'username, email and passwordHash are required' }, { status: 400 });
      }

      const { data: existingByEmail } = await client
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingByEmail) {
        return NextResponse.json({ error: 'Bu e-posta zaten kayıtlı.' }, { status: 409 });
      }

      const { data: existingByUsername } = await client
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (existingByUsername) {
        return NextResponse.json({ error: 'Bu kullanıcı adı zaten alınmış.' }, { status: 409 });
      }

      const { data, error } = await client
        .from('users')
        .insert({ username, email, password_hash: passwordHash })
        .select('id, email, username, created_at')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ user: data });
    }

    if (mode === 'login') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      const passwordHash = String(body?.passwordHash ?? '').trim();

      if (!email || !passwordHash) {
        return NextResponse.json({ error: 'email and passwordHash are required' }, { status: 400 });
      }

      const { data, error } = await client
        .from('users')
        .select('id, email, username, password_hash, created_at')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const row = data as UserRow | null;
      if (!row || row.password_hash !== passwordHash) {
        return NextResponse.json({ error: 'E-posta veya parola hatalı.' }, { status: 401 });
      }

      return NextResponse.json({
        user: {
          id: row.id,
          email: row.email,
          username: row.username,
          created_at: row.created_at,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported mode' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

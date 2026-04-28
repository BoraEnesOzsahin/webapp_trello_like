Vercel deploy checklist

1. Connect this GitHub repository to Vercel (Import Project).
2. In Vercel Project Settings → Environment Variables add:

- `SUPABASE_URL` → your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` → service role key (keep secret)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon key (if used client-side)
- `NEXT_PUBLIC_USE_SUPABASE` → `true`

3. Make sure the connected branch matches the branch you pushed (e.g., `main`).
4. Deploy and share the generated preview URL.

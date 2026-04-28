-- Supabase init SQL: create workspaces table
create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid default gen_random_uuid() primary key,
  user_id text not null unique,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

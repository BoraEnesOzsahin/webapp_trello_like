-- Supabase init SQL: create users, workspaces, and team collaboration tables
create extension if not exists pgcrypto;

-- Users table (local auth)
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Personal workspaces (legacy, keep for migration)
create table if not exists workspaces (
  id uuid default gen_random_uuid() primary key,
  user_id text not null unique,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shared workspaces (team workspaces)
create table if not exists shared_workspaces (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid not null references users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Workspace members (control who can access shared workspaces)
create table if not exists workspace_members (
  workspace_id uuid not null references shared_workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz default now(),
  primary key (workspace_id, user_id)
);
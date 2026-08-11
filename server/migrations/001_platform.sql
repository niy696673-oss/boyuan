create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists platform_state (
  id boolean primary key default true check (id),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create type app_role as enum ('investor','partner','knowledge_admin','system_admin');
create type visibility_level as enum ('organization','project','private');

create table app_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references app_users(id) on delete cascade,
  membership_role text not null default 'member',
  primary key(project_id,user_id)
);

create table companies (
  id text primary key,
  standard_name text not null,
  aliases text[] not null default '{}',
  english_name text,
  description text not null default '',
  cognition_status text not null,
  attention_status text not null,
  updated_at timestamptz not null default now()
);

create table documents (
  id text primary key,
  file_name text not null,
  file_type text not null,
  file_hash text not null unique,
  size_bytes bigint not null,
  object_key text not null unique,
  visibility visibility_level not null,
  owner_id text references app_users(id),
  project_id text references projects(id),
  uploaded_by text not null references app_users(id),
  parse_status text not null,
  failure_reason text,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table evidence_index (
  evidence_id text primary key,
  company_id text not null,
  document_id text not null,
  file_name text not null,
  content text not null,
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding vector(384) not null,
  visibility visibility_level not null,
  owner_id text,
  project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evidence_search_gin on evidence_index using gin(search_vector);
create index evidence_embedding_hnsw on evidence_index using hnsw(embedding vector_cosine_ops);
create index evidence_company_idx on evidence_index(company_id);
create index documents_project_idx on documents(project_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  actor_name text not null,
  action text not null,
  target text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table model_call_events (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  user_id text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create table retrieval_events (
  id uuid primary key default gen_random_uuid(),
  task_id text,
  user_id text not null,
  query text not null,
  hit_count integer not null,
  latency_ms integer not null,
  created_at timestamptz not null default now()
);

create table citation_quality_events (
  id uuid primary key default gen_random_uuid(),
  task_id text,
  valid_count integer not null,
  total_count integer not null,
  created_at timestamptz not null default now()
);

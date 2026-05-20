create table if not exists public.release_artifacts (
  id uuid primary key default gen_random_uuid(),
  target text not null check (target in ('web', 'extension', 'backoffice')),
  version text not null,
  title text not null,
  channel text not null default 'draft',
  status text not null default 'draft',
  artifact_kind text not null default 'bundle',
  connector_target text,
  file_name text,
  mime_type text,
  file_size_bytes integer,
  sha256 text,
  storage_path text,
  artifact_payload jsonb,
  notes text,
  created_by text not null default 'backoffice',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_artifacts_target_created_idx
  on public.release_artifacts (target, created_at desc);

create index if not exists release_artifacts_status_idx
  on public.release_artifacts (status);

create index if not exists release_artifacts_channel_idx
  on public.release_artifacts (channel);

alter table public.release_artifacts enable row level security;

-- El backoffice accede con SUPABASE_SERVICE_ROLE_KEY desde funciones serverless.
-- No se crean politicas publicas para evitar exponer paquetes, manifiestos o notas internas.

create table if not exists public.social_video_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id text,
  provider text not null default 'runway',
  provider_task_id text,
  status text not null default 'queued',
  model text not null,
  duration_seconds integer not null,
  ratio text not null default '768:1280',
  prompt_text text not null,
  estimated_credits numeric not null default 0,
  estimated_cost_usd numeric not null default 0,
  result_url text,
  failure text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_video_jobs_provider_task_idx
  on public.social_video_jobs (provider, provider_task_id);

create index if not exists social_video_jobs_created_at_idx
  on public.social_video_jobs (created_at desc);

alter table public.social_video_jobs enable row level security;

create table if not exists public.seo_autonomous_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  execution_id text not null unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'completed' check (
    status in ('dry_run', 'completed', 'completed_with_warnings', 'published', 'skipped', 'failed')
  ),
  dry_run boolean not null default true,
  confirmed boolean not null default false,
  trigger_type text not null default 'backoffice' check (trigger_type in ('backoffice', 'cron', 'manual')),
  briefs_generated_count integer not null default 0,
  drafts_created_count integer not null default 0,
  auto_approved_count integer not null default 0,
  published_count integer not null default 0,
  would_publish_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  touched_sitemap boolean not null default false,
  config_json jsonb not null default '{}'::jsonb,
  phases_json jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  published_slugs jsonb not null default '[]'::jsonb,
  skipped_items_json jsonb not null default '[]'::jsonb,
  failed_items_json jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists seo_autonomous_pipeline_runs_started_idx
  on public.seo_autonomous_pipeline_runs (started_at desc);

create index if not exists seo_autonomous_pipeline_runs_status_idx
  on public.seo_autonomous_pipeline_runs (status, started_at desc);

alter table public.seo_autonomous_pipeline_runs enable row level security;

comment on table public.seo_autonomous_pipeline_runs is
  'Historial de ejecuciones del ciclo SEO autonomo. Guarda resumen, fases y motivos sin credenciales ni datos personales.';

create table if not exists public.extension_usage_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null default 'heartbeat',
  anonymous_id_hash text,
  session_id_hash text,
  browser_name text not null default 'unknown',
  browser_version text not null default 'unknown',
  platform text not null default 'unknown',
  country text not null default 'XX',
  extension_version text not null default 'unknown',
  page_domain text not null default 'unknown',
  duration_seconds integer not null default 0,
  active_seconds integer not null default 0,
  source text not null default 'extension',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.extension_usage_events
  add column if not exists page_domain text not null default 'unknown';

alter table public.extension_usage_events
  add column if not exists occurred_at timestamptz not null default now();

create index if not exists extension_usage_events_created_at_idx
  on public.extension_usage_events (created_at desc);

create index if not exists extension_usage_events_occurred_at_idx
  on public.extension_usage_events (occurred_at desc);

create index if not exists extension_usage_events_anonymous_idx
  on public.extension_usage_events (anonymous_id_hash, created_at desc);

create index if not exists extension_usage_events_browser_idx
  on public.extension_usage_events (browser_name, created_at desc);

create index if not exists extension_usage_events_country_idx
  on public.extension_usage_events (country, created_at desc);

create index if not exists extension_usage_events_event_idx
  on public.extension_usage_events (event_name, created_at desc);

create index if not exists extension_usage_events_page_domain_idx
  on public.extension_usage_events (page_domain, created_at desc);

alter table public.extension_usage_events enable row level security;

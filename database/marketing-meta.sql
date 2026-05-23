create extension if not exists pgcrypto;

create table if not exists public.marketing_meta_connections (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'needs_connection' check (status in ('disconnected', 'needs_connection', 'needs_page', 'needs_instagram', 'needs_permissions', 'needs_reauth', 'connected', 'expired', 'error')),
  facebook_user_id text,
  facebook_page_id text,
  facebook_page_name text,
  instagram_business_account_id text,
  scopes jsonb not null default '[]'::jsonb,
  access_token_encrypted text,
  user_access_token_encrypted text,
  page_access_token_encrypted text,
  token_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_meta_settings (
  id uuid primary key default gen_random_uuid(),
  autopost_enabled boolean not null default false,
  frequency_days integer not null default 1,
  max_per_day integer not null default 1,
  preferred_time text not null default '10:00',
  timezone text not null default 'Europe/Madrid',
  facebook_enabled boolean not null default true,
  instagram_enabled boolean not null default true,
  content_mode text not null default 'seo_landings',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_meta_posts (
  id uuid primary key default gen_random_uuid(),
  source_type text,
  source_slug text,
  source_url text,
  platform text not null check (platform in ('facebook', 'instagram')),
  status text not null default 'draft' check (status in ('draft', 'queued', 'publishing', 'published', 'failed', 'skipped')),
  caption text not null default '',
  image_url text,
  published_url text,
  external_post_id text,
  scheduled_for timestamptz,
  published_at timestamptz,
  error_message text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  city text,
  template_type text,
  meta_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_autopublisher_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'running' check (status in ('running', 'published', 'skipped', 'failed')),
  trigger_type text not null default 'cron' check (trigger_type in ('cron', 'manual', 'backoffice')),
  platform text not null default 'multi',
  published_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  result_json jsonb,
  error_message text
);

alter table public.marketing_meta_connections
  add column if not exists user_access_token_encrypted text,
  add column if not exists page_access_token_encrypted text;

alter table public.marketing_meta_connections
  drop constraint if exists marketing_meta_connections_status_check;

alter table public.marketing_meta_connections
  add constraint marketing_meta_connections_status_check
  check (status in ('disconnected', 'needs_connection', 'needs_page', 'needs_instagram', 'needs_permissions', 'needs_reauth', 'connected', 'expired', 'error'));

alter table public.marketing_meta_posts
  add column if not exists city text,
  add column if not exists template_type text,
  add column if not exists meta_response jsonb;

create unique index if not exists marketing_meta_connections_singleton_idx
  on public.marketing_meta_connections ((true));

create index if not exists marketing_meta_posts_platform_status_idx
  on public.marketing_meta_posts (platform, status, created_at desc);

create index if not exists marketing_meta_posts_source_platform_idx
  on public.marketing_meta_posts (platform, source_url, source_slug);

create index if not exists marketing_meta_posts_published_idx
  on public.marketing_meta_posts (platform, published_at desc nulls last);

create index if not exists meta_autopublisher_runs_created_idx
  on public.meta_autopublisher_runs (created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_marketing_meta_connections_updated_at on public.marketing_meta_connections;
create trigger set_marketing_meta_connections_updated_at
before update on public.marketing_meta_connections
for each row execute function set_updated_at();

drop trigger if exists set_marketing_meta_settings_updated_at on public.marketing_meta_settings;
create trigger set_marketing_meta_settings_updated_at
before update on public.marketing_meta_settings
for each row execute function set_updated_at();

drop trigger if exists set_marketing_meta_posts_updated_at on public.marketing_meta_posts;
create trigger set_marketing_meta_posts_updated_at
before update on public.marketing_meta_posts
for each row execute function set_updated_at();

alter table public.marketing_meta_connections enable row level security;
alter table public.marketing_meta_settings enable row level security;
alter table public.marketing_meta_posts enable row level security;
alter table public.meta_autopublisher_runs enable row level security;

comment on table public.marketing_meta_connections is
  'Conexion OAuth oficial de Meta para Facebook Page e Instagram profesional. Tokens cifrados y uso solo backend.';

comment on table public.marketing_meta_settings is
  'Ajustes operativos de Meta Autopublisher. Sale con autopost_enabled=false.';

comment on table public.marketing_meta_posts is
  'Cola y trazabilidad de posts Meta para Facebook e Instagram, derivados de landings SEO publicadas.';

comment on table public.meta_autopublisher_runs is
  'Runs del scheduler Meta Autopublisher. No contiene tokens ni datos sensibles.';

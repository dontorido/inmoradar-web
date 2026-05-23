create extension if not exists pgcrypto;

create table if not exists public.marketing_linkedin_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'linkedin' check (provider = 'linkedin'),
  status text not null default 'needs_connection' check (status in ('disconnected', 'connected', 'needs_connection', 'needs_reauth', 'expired', 'error')),
  mode text not null default 'manual' check (mode in ('manual', 'automatic')),
  linkedin_company_url text not null default 'https://www.linkedin.com/company/inmoradar-app/',
  organization_id text,
  organization_urn text,
  organization_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes jsonb,
  connected_by_user_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_linkedin_connections_provider_idx
  on public.marketing_linkedin_connections (provider);

create table if not exists public.marketing_linkedin_settings (
  id uuid primary key default gen_random_uuid(),
  linkedin_company_url text not null default 'https://www.linkedin.com/company/inmoradar-app/',
  organization_id text,
  organization_urn text,
  daily_generation_enabled boolean not null default true,
  autopost_enabled boolean not null default false,
  auto_publish_enabled boolean not null default false,
  approval_required boolean not null default true,
  frequency text not null default 'every_2_days',
  frequency_days integer not null default 2,
  max_posts_per_day integer not null default 1,
  active_post_type text not null default 'precio_sexy_coste_oculto',
  daily_post_time text not null default '10:00',
  timezone text not null default 'Europe/Madrid',
  content_mode text not null default 'precio_sexy_coste_oculto',
  default_cta text,
  default_hashtags jsonb,
  destination_url text not null default 'https://inmoradar.app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  post_type text not null default 'precio_sexy_coste_oculto',
  title text,
  headline text,
  price_display text,
  hidden_costs jsonb,
  hook text,
  copy text,
  body text not null default '',
  cta text,
  hashtags jsonb,
  image_path text,
  image_url text,
  image_prompt text,
  linkedin_image_urn text,
  linkedin_post_urn text,
  linkedin_post_id text,
  linkedin_company_url text not null default 'https://www.linkedin.com/company/inmoradar-app/',
  organization_urn text,
  city text,
  source_type text check (source_type is null or source_type in ('manual', 'auto', 'property', 'template')),
  source_reference text,
  scheduled_at timestamptz,
  published_at timestamptz,
  manually_published_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'image_pending', 'ready', 'pending_review', 'scheduled', 'publishing', 'published', 'manually_published', 'failed', 'skipped', 'needs_connection', 'cancelled')),
  approval_required boolean not null default true,
  approved_by_user_id text,
  approved_at timestamptz,
  error_message text,
  linkedin_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.linkedin_autopublisher_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'published', 'skipped', 'failed')),
  generated_count integer not null default 0,
  published_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.marketing_linkedin_connections
  add column if not exists linkedin_company_url text not null default 'https://www.linkedin.com/company/inmoradar-app/',
  add column if not exists organization_id text;

alter table public.marketing_linkedin_connections
  drop constraint if exists marketing_linkedin_connections_status_check;

alter table public.marketing_linkedin_connections
  add constraint marketing_linkedin_connections_status_check
  check (status in ('disconnected', 'connected', 'needs_connection', 'needs_reauth', 'expired', 'error'));

alter table public.marketing_linkedin_settings
  add column if not exists linkedin_company_url text not null default 'https://www.linkedin.com/company/inmoradar-app/',
  add column if not exists organization_id text,
  add column if not exists organization_urn text,
  add column if not exists autopost_enabled boolean not null default false,
  add column if not exists frequency text not null default 'every_2_days',
  add column if not exists frequency_days integer not null default 2,
  add column if not exists max_posts_per_day integer not null default 1,
  add column if not exists active_post_type text not null default 'precio_sexy_coste_oculto';

alter table public.marketing_linkedin_posts
  add column if not exists post_type text not null default 'precio_sexy_coste_oculto',
  add column if not exists headline text,
  add column if not exists price_display text,
  add column if not exists hidden_costs jsonb,
  add column if not exists copy text,
  add column if not exists image_prompt text,
  add column if not exists linkedin_post_id text,
  add column if not exists linkedin_company_url text not null default 'https://www.linkedin.com/company/inmoradar-app/',
  add column if not exists organization_urn text,
  add column if not exists city text;

alter table public.marketing_linkedin_posts
  drop constraint if exists marketing_linkedin_posts_status_check;

alter table public.marketing_linkedin_posts
  add constraint marketing_linkedin_posts_status_check
  check (status in ('draft', 'image_pending', 'ready', 'pending_review', 'scheduled', 'publishing', 'published', 'manually_published', 'failed', 'skipped', 'needs_connection', 'cancelled'));

create index if not exists marketing_linkedin_posts_status_scheduled_idx
  on public.marketing_linkedin_posts (status, scheduled_at desc nulls last, created_at desc);

create index if not exists marketing_linkedin_posts_created_idx
  on public.marketing_linkedin_posts (created_at desc);

create index if not exists marketing_linkedin_posts_published_idx
  on public.marketing_linkedin_posts (published_at desc nulls last);

create index if not exists linkedin_autopublisher_runs_started_idx
  on public.linkedin_autopublisher_runs (started_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_marketing_linkedin_connections_updated_at on public.marketing_linkedin_connections;
create trigger set_marketing_linkedin_connections_updated_at
before update on public.marketing_linkedin_connections
for each row execute function set_updated_at();

drop trigger if exists set_marketing_linkedin_settings_updated_at on public.marketing_linkedin_settings;
create trigger set_marketing_linkedin_settings_updated_at
before update on public.marketing_linkedin_settings
for each row execute function set_updated_at();

drop trigger if exists set_marketing_linkedin_posts_updated_at on public.marketing_linkedin_posts;
create trigger set_marketing_linkedin_posts_updated_at
before update on public.marketing_linkedin_posts
for each row execute function set_updated_at();

alter table public.marketing_linkedin_connections enable row level security;
alter table public.marketing_linkedin_settings enable row level security;
alter table public.marketing_linkedin_posts enable row level security;
alter table public.linkedin_autopublisher_runs enable row level security;

comment on table public.marketing_linkedin_connections is
  'Conexion OAuth oficial de LinkedIn para InmoRadar. Tokens cifrados y uso solo desde backoffice/serverless.';

comment on table public.marketing_linkedin_settings is
  'Ajustes operativos de generacion y publicacion LinkedIn. Auto publish desactivado por defecto.';

comment on table public.marketing_linkedin_posts is
  'Cola de posts LinkedIn con modo manual siempre disponible y modo automatico protegido por API oficial.';

comment on table public.linkedin_autopublisher_runs is
  'Runs del scheduler LinkedIn Autopublisher. No contiene tokens ni datos sensibles.';

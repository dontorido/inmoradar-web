create extension if not exists pgcrypto;

create table if not exists public.marketing_linkedin_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'linkedin' check (provider = 'linkedin'),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'expired', 'error')),
  mode text not null default 'manual' check (mode in ('manual', 'automatic')),
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
  daily_generation_enabled boolean not null default true,
  auto_publish_enabled boolean not null default false,
  approval_required boolean not null default true,
  daily_post_time text not null default '09:30',
  timezone text not null default 'Europe/Madrid',
  content_mode text not null default 'mixed',
  default_cta text,
  default_hashtags jsonb,
  destination_url text not null default 'https://inmoradar.app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  title text,
  hook text,
  body text not null default '',
  cta text,
  hashtags jsonb,
  image_path text,
  image_url text,
  linkedin_image_urn text,
  linkedin_post_urn text,
  source_type text check (source_type is null or source_type in ('manual', 'auto', 'property', 'template')),
  source_reference text,
  scheduled_at timestamptz,
  published_at timestamptz,
  manually_published_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'scheduled', 'publishing', 'published', 'manually_published', 'failed', 'cancelled')),
  approval_required boolean not null default true,
  approved_by_user_id text,
  approved_at timestamptz,
  error_message text,
  linkedin_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_linkedin_posts_status_scheduled_idx
  on public.marketing_linkedin_posts (status, scheduled_at desc nulls last, created_at desc);

create index if not exists marketing_linkedin_posts_created_idx
  on public.marketing_linkedin_posts (created_at desc);

create index if not exists marketing_linkedin_posts_published_idx
  on public.marketing_linkedin_posts (published_at desc nulls last);

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

comment on table public.marketing_linkedin_connections is
  'Conexion OAuth oficial de LinkedIn para InmoRadar. Tokens cifrados y uso solo desde backoffice/serverless.';

comment on table public.marketing_linkedin_settings is
  'Ajustes operativos de generacion y publicacion LinkedIn. Auto publish desactivado por defecto.';

comment on table public.marketing_linkedin_posts is
  'Cola de posts LinkedIn con modo manual siempre disponible y modo automatico protegido por API oficial.';
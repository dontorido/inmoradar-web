-- Proposed schema for Marketing -> Social media asset library.
-- Do not execute automatically. Apply manually in Supabase when Fase 2C.1 is ready.

create extension if not exists pgcrypto;

create table if not exists public.social_media_assets (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'manual',
  provider_asset_id text,
  provider_job_id text,
  media_type text not null,
  status text not null default 'draft',
  title text,
  description text,
  public_url text,
  thumbnail_url text,
  duration_seconds numeric,
  width integer,
  height integer,
  ratio text,
  mime_type text,
  file_size_bytes bigint,
  license_status text not null default 'internal',
  usage_notes text,
  source_prompt text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_media_assets_provider_check
    check (provider in ('manual', 'runway', 'external', 'future_stock')),
  constraint social_media_assets_media_type_check
    check (media_type in ('image', 'video')),
  constraint social_media_assets_status_check
    check (status in ('draft', 'processing', 'ready', 'failed', 'archived')),
  constraint social_media_assets_license_status_check
    check (license_status in ('internal', 'licensed', 'unknown', 'restricted'))
);

create index if not exists social_media_assets_provider_status_idx
  on public.social_media_assets (provider, status, created_at desc);

create index if not exists social_media_assets_media_type_status_idx
  on public.social_media_assets (media_type, status, created_at desc);

create index if not exists social_media_assets_created_at_idx
  on public.social_media_assets (created_at desc);

create or replace function public.set_social_media_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_social_media_assets_updated_at'
      and tgrelid = 'public.social_media_assets'::regclass
  ) then
    execute 'create trigger set_social_media_assets_updated_at
      before update on public.social_media_assets
      for each row
      execute function public.set_social_media_assets_updated_at()';
  end if;
end;
$$;

alter table public.social_media_assets enable row level security;

alter table public.social_posts
  add column if not exists media_asset_id uuid references public.social_media_assets(id);

create index if not exists social_posts_media_asset_idx
  on public.social_posts (media_asset_id);

comment on table public.social_media_assets is
  'Reusable image and video assets for Marketing -> Social. Scheduler/autopublisher intentionally disabled in Fase 2C.1.';

comment on column public.social_posts.media_asset_id is
  'Optional link to a reusable social_media_assets row. Existing media_url remains supported for backwards compatibility.';

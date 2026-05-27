-- Proposed schema for Marketing -> Social editorial queue.
-- Do not execute automatically. Apply manually in Supabase when Fase 2A is ready.

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  format text not null default 'image',
  status text not null default 'draft',
  source text not null default 'manual',
  topic text,
  caption text,
  media_url text,
  target_url text,
  utm_source text,
  utm_campaign text default 'organic_social',
  scheduled_at timestamptz,
  published_at timestamptz,
  published_media_id text,
  error_message text,
  meta_response jsonb,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_platform_check
    check (platform in ('instagram', 'facebook', 'linkedin', 'tiktok')),
  constraint social_posts_format_check
    check (format in ('image', 'carousel', 'reel', 'video', 'link', 'text')),
  constraint social_posts_status_check
    check (status in ('draft', 'needs_review', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected', 'cancelled'))
);

create index if not exists social_posts_platform_status_idx
  on public.social_posts (platform, status, created_at desc);

create index if not exists social_posts_scheduled_idx
  on public.social_posts (scheduled_at desc nulls last, created_at desc);

create index if not exists social_posts_published_idx
  on public.social_posts (published_at desc nulls last);

create or replace function public.set_social_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_social_posts_updated_at on public.social_posts;
create trigger set_social_posts_updated_at
before update on public.social_posts
for each row
execute function public.set_social_posts_updated_at();

alter table public.social_posts enable row level security;

comment on table public.social_posts is
  'Editorial social queue for InmoRadar BackOffice. Scheduler/autopublisher intentionally disabled in Fase 2A.';

-- Owned analytics events for anonymous SEO/conversion learning.
-- Inserts are performed by backend/serverless code with Supabase service role.
-- Do not add public write policies to this table.

create extension if not exists pgcrypto;

create table if not exists public.owned_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  anonymous_session_id text,
  page_path text,
  page_url text,
  page_type text,
  content_type text,
  template_type text,
  slug text,
  city text,
  topic text,
  source text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  browser text,
  device_type text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists owned_analytics_events_event_name_occurred_at_idx
  on public.owned_analytics_events (event_name, occurred_at desc);

create index if not exists owned_analytics_events_page_path_occurred_at_idx
  on public.owned_analytics_events (page_path, occurred_at desc);

create index if not exists owned_analytics_events_content_type_occurred_at_idx
  on public.owned_analytics_events (content_type, occurred_at desc);

create index if not exists owned_analytics_events_template_type_occurred_at_idx
  on public.owned_analytics_events (template_type, occurred_at desc);

create index if not exists owned_analytics_events_slug_occurred_at_idx
  on public.owned_analytics_events (slug, occurred_at desc);

create index if not exists owned_analytics_events_city_occurred_at_idx
  on public.owned_analytics_events (city, occurred_at desc);

alter table public.owned_analytics_events enable row level security;

comment on table public.owned_analytics_events is
  'Anonymous first-party SEO and conversion events for InmoRadar. Backend inserts with service role; no IP, email or payment details.';
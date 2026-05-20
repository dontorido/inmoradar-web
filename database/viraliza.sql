create table if not exists public.viral_routines (
  id text primary key,
  date date not null unique,
  theme text not null,
  status text not null default 'pending',
  completion_rate numeric not null default 0,
  daily_goal text,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_tasks (
  id text primary key,
  routine_id text references public.viral_routines(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  priority text,
  status text not null default 'pending',
  notes text,
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_keywords (
  id text primary key,
  routine_id text references public.viral_routines(id) on delete cascade,
  keyword text not null,
  category text,
  intent text,
  platform_priority text[],
  search_url_tiktok text,
  search_url_instagram text,
  search_url_youtube text,
  search_url_google text,
  search_url_linkedin text,
  search_url_x text,
  status text not null default 'pending',
  performance_score numeric not null default 0,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_creators (
  id text primary key,
  name text,
  handle text,
  platform text,
  url text,
  category text,
  city text,
  country text,
  followers integer,
  avg_views integer,
  avg_comments integer,
  posting_frequency text,
  topics text[],
  creator_fit_score numeric not null default 0,
  outreach_score numeric not null default 0,
  why_relevant text,
  best_collab_idea text,
  recommended_action text,
  status text not null default 'suggested',
  last_contacted_at timestamptz,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_follow_queue (
  id text primary key,
  routine_id text references public.viral_routines(id) on delete cascade,
  creator_id text references public.viral_creators(id) on delete set null,
  reason text,
  suggested_comment text,
  status text not null default 'pending',
  followed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_comments (
  id text primary key,
  routine_id text references public.viral_routines(id) on delete cascade,
  text text not null,
  type text,
  brand_mention boolean not null default false,
  best_for text,
  status text not null default 'pending',
  copied_at timestamptz,
  used_on_url text,
  result_likes integer,
  result_replies integer,
  result_notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_outreach_messages (
  id text primary key,
  routine_id text references public.viral_routines(id) on delete cascade,
  creator_id text references public.viral_creators(id) on delete set null,
  message_type text,
  message_text text not null,
  collaboration_idea text,
  status text not null default 'pending',
  sent_at timestamptz,
  replied_at timestamptz,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_hooks (
  id text primary key,
  routine_id text references public.viral_routines(id) on delete cascade,
  hook text not null,
  category text,
  series text,
  suggested_duration integer,
  suggested_cta text,
  overlay_example text,
  script_preview text,
  status text not null default 'pending',
  performance_score numeric not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_saved_videos (
  id text primary key,
  routine_id text references public.viral_routines(id) on delete cascade,
  platform text,
  url text,
  creator_handle text,
  topic text,
  hook text,
  duration integer,
  likes integer,
  comments integer,
  shares integer,
  why_it_works text,
  adaptation_idea text,
  status text not null default 'saved',
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_video_briefs (
  id text primary key,
  source_type text,
  source_id text,
  title text,
  series text,
  platform text,
  duration integer,
  hook text,
  script text,
  overlays jsonb,
  caption text,
  hashtags jsonb,
  cta text,
  disclaimer text,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viral_results (
  id text primary key,
  entity_type text not null,
  entity_id text,
  metric_name text not null,
  metric_value numeric not null default 0,
  recorded_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists viral_routines_date_idx on public.viral_routines (date desc);
create index if not exists viral_tasks_routine_idx on public.viral_tasks (routine_id, status);
create index if not exists viral_keywords_routine_idx on public.viral_keywords (routine_id);
create index if not exists viral_creators_score_idx on public.viral_creators (creator_fit_score desc);
create index if not exists viral_comments_routine_idx on public.viral_comments (routine_id);
create index if not exists viral_hooks_routine_idx on public.viral_hooks (routine_id);
create index if not exists viral_results_entity_idx on public.viral_results (entity_type, entity_id);

alter table public.viral_routines enable row level security;
alter table public.viral_tasks enable row level security;
alter table public.viral_keywords enable row level security;
alter table public.viral_creators enable row level security;
alter table public.viral_follow_queue enable row level security;
alter table public.viral_comments enable row level security;
alter table public.viral_outreach_messages enable row level security;
alter table public.viral_hooks enable row level security;
alter table public.viral_saved_videos enable row level security;
alter table public.viral_video_briefs enable row level security;
alter table public.viral_results enable row level security;

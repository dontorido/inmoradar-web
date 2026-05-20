create table if not exists public.social_video_projects (
  id text primary key,
  title text not null,
  city text,
  topic text,
  topic_label text,
  platform text,
  series_id text,
  objective text,
  status text not null default 'storyboard_ready' check (
    status in (
      'storyboard_ready',
      'ai_clip_queued',
      'ai_clip_ready',
      'final_exported',
      'failed',
      'archived'
    )
  ),
  duration_seconds integer,
  visual_style text,
  music_style text,
  cta text,
  has_uploaded_clip boolean not null default false,
  has_ai_clip boolean not null default false,
  final_exported_at timestamptz,
  last_job_id uuid,
  failure text,
  project_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_video_projects_status_updated_idx
  on public.social_video_projects (status, updated_at desc);

create index if not exists social_video_projects_topic_city_idx
  on public.social_video_projects (topic, city);

alter table public.social_video_projects enable row level security;

comment on table public.social_video_projects is
  'Proyectos del Social Video Studio: brief, storyboard, estado operativo y JSON completo del video.';

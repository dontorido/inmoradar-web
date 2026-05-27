-- Proposed storage setup for Marketing -> Social assets.
-- Do not execute automatically. Apply manually in Supabase when Fase 2C.2 is ready.

-- Option A: create/update the bucket from SQL.
-- This touches only Supabase Storage metadata, not InmoRadar app tables.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'social-assets',
  'social-assets',
  true,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Option B: if your Supabase project does not allow bucket management via SQL,
-- create it manually:
--   Supabase Dashboard -> Storage -> New bucket
--   Name: social-assets
--   Public bucket: enabled
--   Allowed MIME types:
--     image/jpeg
--     image/png
--     image/webp
--     video/mp4
--     video/webm
--   File size limit: 100 MB
--
-- The backend uploads with SUPABASE_SERVICE_ROLE_KEY, so no public write policy is
-- required. Public read is handled by the bucket being public.

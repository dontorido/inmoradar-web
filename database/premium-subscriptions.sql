create table if not exists public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  provider text not null default 'lemonsqueezy',
  provider_customer_id text,
  provider_subscription_id text,
  provider_order_id text,
  status text not null default 'unknown',
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  product_id text,
  variant_id text,
  event_name text,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists premium_subscriptions_email_idx
  on public.premium_subscriptions (email);

create index if not exists premium_subscriptions_status_idx
  on public.premium_subscriptions (status);

create index if not exists premium_subscriptions_provider_subscription_idx
  on public.premium_subscriptions (provider_subscription_id);

alter table public.premium_subscriptions enable row level security;

-- Las funciones serverless usan SUPABASE_SERVICE_ROLE_KEY y no dependen de politicas publicas.
-- No creamos politicas de lectura desde cliente para no exponer emails de suscriptores.

create table if not exists public.premium_revenue_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'lemonsqueezy',
  provider_event_id text not null unique,
  provider_customer_id text,
  provider_subscription_id text,
  provider_order_id text,
  event_name text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  occurred_at timestamptz not null default now(),
  raw_event jsonb,
  created_at timestamptz not null default now()
);

create index if not exists premium_revenue_events_occurred_idx
  on public.premium_revenue_events (occurred_at desc);

create index if not exists premium_revenue_events_subscription_idx
  on public.premium_revenue_events (provider_subscription_id);

create index if not exists premium_revenue_events_order_idx
  on public.premium_revenue_events (provider_order_id);

alter table public.premium_revenue_events enable row level security;

-- Las funciones serverless usan SUPABASE_SERVICE_ROLE_KEY y no dependen de politicas publicas.
-- No creamos politicas de lectura desde cliente para no exponer facturacion.

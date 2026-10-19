-- Onboarding location, feed keys. Safe to re-run. RLS stays in 0002.

alter table sites add column if not exists address text;
alter table sites add column if not exists latitude double precision;
alter table sites add column if not exists longitude double precision;
alter table sites add column if not exists onboarded_at timestamptz;

create table if not exists feed_keys (
  id uuid primary key,
  site_id uuid not null references sites (id),
  key_hash text not null,
  key_hint text not null,
  created_at timestamptz not null default now()
);

create index if not exists feed_keys_site_idx on feed_keys (site_id);

create table if not exists arrival_drafts (
  id uuid primary key,
  site_id uuid not null references sites (id),
  sender text not null,
  subject text,
  body text not null,
  parsed jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  check (status in ('draft', 'confirmed', 'rejected'))
);

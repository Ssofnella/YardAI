-- Yardline core schema. Runs on embedded Postgres (PGlite) and on Supabase.
-- Safe to run more than once. Row-level security lives in 0002_rls.sql so this
-- file does not depend on Supabase's auth schema.

create table if not exists companies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sites (
  id uuid primary key,
  company_id uuid not null references companies (id),
  name text not null,
  timezone text not null default 'America/Chicago',
  current_config_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists site_configs (
  id uuid primary key,
  site_id uuid not null references sites (id),
  company_id uuid not null references companies (id),
  version integer not null,
  note text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (site_id, version)
);

do $$ begin
  alter table sites
    add constraint sites_current_config_fk
    foreign key (current_config_id) references site_configs (id);
exception
  when duplicate_object then null;
end $$;

create table if not exists carriers (
  id uuid primary key,
  company_id uuid not null references companies (id),
  name text not null,
  scac text not null,
  unique (company_id, scac)
);

create table if not exists drivers (
  id uuid primary key,
  company_id uuid not null references companies (id),
  name text not null,
  unique (company_id, name)
);

create table if not exists tractors (
  id uuid primary key,
  company_id uuid not null references companies (id),
  tractor_number text not null,
  carrier_scac text,
  unique (company_id, tractor_number)
);

create table if not exists trailers (
  id uuid primary key,
  company_id uuid not null references companies (id),
  trailer_number text not null,
  scac text not null,
  is_reefer boolean not null default false,
  unique (company_id, scac, trailer_number)
);

create table if not exists appointments (
  id uuid primary key,
  site_id uuid not null references sites (id),
  company_id uuid not null references companies (id),
  appointment_code text not null,
  load_id text,
  carrier_name text not null,
  scac text not null,
  trailer_number text,
  trailer_id uuid references trailers (id),
  driver_name text,
  tractor_number text,
  load_type text not null,
  empty_or_loaded text not null,
  is_reefer boolean not null default false,
  setpoint_f double precision,
  planned_at timestamptz not null,
  expected_seal text,
  status text not null default 'expected',
  created_at timestamptz not null default now(),
  unique (site_id, appointment_code),
  check (status in ('expected', 'arrived', 'no_show', 'cancelled'))
);

alter table appointments add column if not exists expected_seal text;

create table if not exists visits (
  id uuid primary key,
  site_id uuid not null references sites (id),
  company_id uuid not null references companies (id),
  trailer_id uuid references trailers (id),
  trailer_number text not null,
  scac text not null,
  carrier_name text not null,
  tractor_number text,
  driver_name text,
  seal_in text,
  seal_out text,
  load_id text,
  appointment_id uuid references appointments (id),
  appointment_code text,
  load_type text,
  empty_or_loaded text,
  is_reefer boolean not null default false,
  setpoint_f double precision,
  temp_f double precision,
  fuel_pct double precision,
  status_key text not null,
  location_kind text not null,
  location_id text,
  location_label text,
  handling text not null default 'drop',
  custom_fields jsonb not null default '{}'::jsonb,
  photo_ids jsonb not null default '[]'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  checked_in_at timestamptz not null,
  checked_out_at timestamptz,
  work_completed_at timestamptz,
  minutes_late integer,
  planned_at timestamptz,
  created_at timestamptz not null default now(),
  check (location_kind in ('spot', 'door', 'offsite')),
  check (handling in ('live', 'drop'))
);

create index if not exists visits_onsite_idx
  on visits (site_id)
  where checked_out_at is null;

-- Append-only log. The trigger blocks update and delete unless a maintenance
-- setting is on, which only the demo reset uses inside a transaction.
create table if not exists events (
  id uuid primary key,
  site_id uuid not null references sites (id),
  company_id uuid not null references companies (id),
  event_type text not null,
  trailer_id uuid,
  trailer_number text,
  scac text,
  load_id text,
  appointment_id text,
  location text,
  occurred_at timestamptz not null,
  source text not null,
  visit_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source in ('manual', 'simulator'))
);

create index if not exists events_site_time_idx
  on events (site_id, occurred_at desc);

create or replace function events_immutable() returns trigger as $$
begin
  if coalesce(current_setting('yard.allow_maintenance', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception 'events are append-only';
end;
$$ language plpgsql;

drop trigger if exists events_no_update on events;
create trigger events_no_update
  before update or delete on events
  for each row execute function events_immutable();

create table if not exists photos (
  id uuid primary key,
  site_id uuid not null references sites (id),
  company_id uuid not null references companies (id),
  content_type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists sim_state (
  site_id uuid primary key references sites (id),
  status text not null default 'idle',
  speed integer not null default 4,
  day_start timestamptz,
  day_end timestamptz,
  sim_now timestamptz,
  plan jsonb not null default '[]'::jsonb,
  done_ids jsonb not null default '[]'::jsonb,
  last_error text,
  updated_at timestamptz not null default now(),
  check (status in ('idle', 'running', 'paused', 'done'))
);

-- Reserved for later slices. Unused by the first demo.
create table if not exists move_requests (
  id uuid primary key,
  company_id uuid not null references companies (id),
  site_id uuid not null references sites (id),
  visit_id uuid references visits (id),
  trailer_number text,
  scac text,
  from_location text,
  to_location text,
  priority text not null default 'normal',
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists detention_terms (
  id uuid primary key,
  company_id uuid not null references companies (id),
  site_id uuid references sites (id),
  carrier_scac text,
  load_type text,
  free_minutes integer not null default 120,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key,
  company_id uuid not null references companies (id),
  site_id uuid references sites (id),
  user_id uuid,
  role text not null,
  created_at timestamptz not null default now(),
  check (role in ('admin', 'office', 'gate', 'yard_driver', 'read_only'))
);

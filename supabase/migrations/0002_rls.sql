-- Row-level security for Supabase. Do not run this against the embedded
-- Postgres used for the local demo: it calls auth.uid(), which Supabase
-- provides. The Next.js server connects as the database owner and bypasses
-- these policies. They protect direct access with the anon or user key.
--
-- A signed-in user can read and write rows for companies where they have a
-- membership. Events can be inserted and read, never updated or deleted.

alter table companies enable row level security;
alter table sites enable row level security;
alter table site_configs enable row level security;
alter table carriers enable row level security;
alter table drivers enable row level security;
alter table tractors enable row level security;
alter table trailers enable row level security;
alter table appointments enable row level security;
alter table visits enable row level security;
alter table events enable row level security;
alter table photos enable row level security;
alter table sim_state enable row level security;
alter table move_requests enable row level security;
alter table detention_terms enable row level security;
alter table memberships enable row level security;

drop policy if exists memberships_self_select on memberships;
create policy memberships_self_select on memberships
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists companies_member_select on companies;
create policy companies_member_select on companies
  for select to authenticated
  using (id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists companies_member_update on companies;
create policy companies_member_update on companies
  for update to authenticated
  using (id in (
    select company_id from memberships
    where user_id = auth.uid() and role = 'admin'
  ));

-- Helper policies repeat the membership subquery so each table is keyed by
-- company_id, and site-scoped tables also allow a membership limited to that site.

drop policy if exists sites_member_all on sites;
create policy sites_member_all on sites
  for all to authenticated
  using (
    company_id in (select company_id from memberships where user_id = auth.uid())
    and (
      id in (select site_id from memberships where user_id = auth.uid() and site_id is not null)
      or exists (
        select 1 from memberships
        where user_id = auth.uid() and company_id = sites.company_id and site_id is null
      )
    )
  )
  with check (
    company_id in (select company_id from memberships where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists site_configs_member_all on site_configs;
create policy site_configs_member_all on site_configs
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (
    select company_id from memberships where user_id = auth.uid() and role in ('admin', 'office')
  ));

drop policy if exists carriers_member_all on carriers;
create policy carriers_member_all on carriers
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists drivers_member_all on drivers;
create policy drivers_member_all on drivers
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists tractors_member_all on tractors;
create policy tractors_member_all on tractors
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists trailers_member_all on trailers;
create policy trailers_member_all on trailers
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists appointments_member_all on appointments;
create policy appointments_member_all on appointments
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists visits_member_all on visits;
create policy visits_member_all on visits
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists events_member_select on events;
create policy events_member_select on events
  for select to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists events_member_insert on events;
create policy events_member_insert on events
  for insert to authenticated
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists photos_member_all on photos;
create policy photos_member_all on photos
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists sim_state_member_all on sim_state;
create policy sim_state_member_all on sim_state
  for all to authenticated
  using (site_id in (select id from sites where company_id in (
    select company_id from memberships where user_id = auth.uid()
  )))
  with check (site_id in (select id from sites where company_id in (
    select company_id from memberships where user_id = auth.uid()
  )));

drop policy if exists move_requests_member_all on move_requests;
create policy move_requests_member_all on move_requests
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (select company_id from memberships where user_id = auth.uid()));

drop policy if exists detention_terms_member_all on detention_terms;
create policy detention_terms_member_all on detention_terms
  for all to authenticated
  using (company_id in (select company_id from memberships where user_id = auth.uid()))
  with check (company_id in (
    select company_id from memberships where user_id = auth.uid() and role in ('admin', 'office')
  ));

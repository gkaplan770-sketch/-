-- Run this once in Supabase SQL Editor if the dashboard shows
-- "permission denied for table ..." (Postgres error 42501).

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant all on tables to postgres, service_role;

alter default privileges in schema public
  grant all on sequences to postgres, service_role;

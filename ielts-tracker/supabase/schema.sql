-- Optional, unexecuted setup for a NEW Supabase project. Contains no personal data.
-- Reviewed against https://supabase.com/docs/guides/database/postgres/row-level-security
begin;
create table public.ielts_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'app' = 'ielts-tracker'),
  revision bigint not null default 1 check (revision > 0)
);
alter table public.ielts_snapshots enable row level security;
revoke all on public.ielts_snapshots from anon;
revoke all on public.ielts_snapshots from authenticated;
grant select, insert, update, delete on public.ielts_snapshots to authenticated;
create policy "read own learning snapshot" on public.ielts_snapshots for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
create policy "insert own learning snapshot" on public.ielts_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
create policy "update own learning snapshot" on public.ielts_snapshots for update to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true')
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
create policy "delete own learning snapshot" on public.ielts_snapshots for delete to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
commit;

-- Run once in the Supabase SQL editor on a new project.
create table public.drafts (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null,
 updated_at timestamptz not null default now()
);
create index drafts_user_id_idx on public.drafts(user_id);
alter table public.drafts enable row level security;
grant select, insert, update, delete on public.drafts to authenticated;
create policy "Owners read drafts" on public.drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners insert drafts" on public.drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update drafts" on public.drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete drafts" on public.drafts for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('part-photos','part-photos',false,5242880,array['image/jpeg']);
create policy "Owners upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'part-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners read photos" on storage.objects for select to authenticated using (bucket_id = 'part-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners delete photos" on storage.objects for delete to authenticated using (bucket_id = 'part-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Storage bucket for DohDocs inline images.
-- Images are uploaded by authenticated users and served publicly so any
-- recipient of a shared note can load them without signing in.

insert into storage.buckets (id, name, public)
values ('doc-images', 'doc-images', true)
on conflict (id) do nothing;

-- Authenticated users may upload objects to their own namespace.
create policy "Authenticated users can upload doc images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'doc-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (bucket is already public, but an explicit policy is belt-and-suspenders).
create policy "Doc images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'doc-images');

-- Users may delete only their own images.
create policy "Users can delete their own doc images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'doc-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

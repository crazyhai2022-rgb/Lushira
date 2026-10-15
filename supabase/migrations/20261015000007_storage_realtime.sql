-- Storage: salon media (logo / cover / gallery / service images). Public read by URL, owner-only write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('salon-media', 'salon-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- object path convention: <salon_id>/<kind>/<file>
create policy salon_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'salon-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (private.owns_salon(((storage.foldername(name))[1])::uuid) or private.is_admin()));
create policy salon_media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'salon-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (private.owns_salon(((storage.foldername(name))[1])::uuid) or private.is_admin()));
create policy salon_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'salon-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (private.owns_salon(((storage.foldername(name))[1])::uuid) or private.is_admin()));
create policy salon_media_owner_list on storage.objects for select to authenticated
  using (bucket_id = 'salon-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (private.owns_salon(((storage.foldername(name))[1])::uuid) or private.is_admin()));

-- Realtime (RLS still applies to every subscriber)
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.provider_locations;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.booking_status_history;

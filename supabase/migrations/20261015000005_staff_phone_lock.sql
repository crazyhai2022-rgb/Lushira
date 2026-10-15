-- Staff phone numbers are never readable through the public API (column kept, access removed)
revoke select on public.salon_staff from anon, authenticated;
grant select (id, salon_id, user_id, name, role_title, photo_url, is_active, created_at) on public.salon_staff to anon, authenticated;

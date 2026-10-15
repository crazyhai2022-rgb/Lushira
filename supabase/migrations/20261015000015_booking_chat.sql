-- Live chat between customer and salon/beautician for a confirmed booking (text + photos, sent/delivered/seen ticks)
create or replace function private.is_booking_participant(bid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = bid and (b.customer_id = (select auth.uid()) or private.owns_salon(b.salon_id) or private.is_assigned_provider(b.staff_id)));
$$;
grant execute on function private.is_booking_participant(uuid) to authenticated, service_role;

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text check (body is null or char_length(body) <= 2000),
  image_path text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  check (body is not null or image_path is not null)
);
create index if not exists booking_messages_idx on public.booking_messages (booking_id, created_at);
alter table public.booking_messages enable row level security;
create policy booking_messages_read on public.booking_messages for select to authenticated
  using (private.is_booking_participant(booking_id) or private.is_admin());
revoke insert, update, delete on public.booking_messages from authenticated, anon;

create or replace function public.send_booking_message(p_booking_id uuid, p_body text default null, p_image_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); b public.bookings; mid uuid; txt text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not private.is_booking_participant(p_booking_id) then raise exception 'forbidden'; end if;
  select * into b from bookings where id = p_booking_id;
  if b.status not in ('confirmed','provider_assigned','on_the_way','in_progress','completed') then raise exception 'chat_not_available'; end if;
  if txt is null and p_image_path is null then raise exception 'empty_message'; end if;
  if p_image_path is not null and split_part(p_image_path, '/', 1) <> p_booking_id::text then raise exception 'bad_image'; end if;
  insert into booking_messages (booking_id, sender_id, body, image_path) values (p_booking_id, uid, txt, p_image_path) returning id into mid;
  return mid;
end $$;

-- recipient's app received the message -> delivered; recipient opened the chat -> read (blue ticks)
create or replace function public.mark_messages_delivered(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_booking_participant(p_booking_id) then return; end if;
  update booking_messages set delivered_at = now() where booking_id = p_booking_id and sender_id <> (select auth.uid()) and delivered_at is null;
end $$;
create or replace function public.mark_messages_read(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_booking_participant(p_booking_id) then return; end if;
  update booking_messages set read_at = now(), delivered_at = coalesce(delivered_at, now())
   where booking_id = p_booking_id and sender_id <> (select auth.uid()) and read_at is null;
end $$;
revoke execute on function public.send_booking_message(uuid, text, text), public.mark_messages_delivered(uuid), public.mark_messages_read(uuid) from public, anon;
grant execute on function public.send_booking_message(uuid, text, text), public.mark_messages_delivered(uuid), public.mark_messages_read(uuid) to authenticated;

alter publication supabase_realtime add table public.booking_messages;
alter table public.booking_messages replica identity full;

-- private bucket for chat photos: <booking_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_booking_participant(((storage.foldername(name))[1])::uuid));
create policy chat_media_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_booking_participant(((storage.foldername(name))[1])::uuid));

-- Readable coordinates for the client.
-- salons: generated from the PostGIS point (REST reads). provider_locations: plain lat/lng so Realtime payloads carry them.
alter table public.salons
  add column if not exists lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column if not exists lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored;

alter table public.provider_locations
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180);

create or replace function public.provider_locations_sync()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lat is null or new.lng is null then raise exception 'invalid_coordinates'; end if;
  new.location := extensions.st_setsrid(extensions.st_makepoint(new.lng, new.lat), 4326)::extensions.geography;
  new.recorded_at := now();
  return new;
end $$;
create trigger provider_locations_sync_trg before insert or update on public.provider_locations
  for each row execute function public.provider_locations_sync();

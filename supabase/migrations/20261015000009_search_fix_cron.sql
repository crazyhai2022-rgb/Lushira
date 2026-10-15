-- search_services: only report at-home when the salon really offers home service; schedule payment-timeout expiry
create or replace function public.search_services(
  p_query text default null, p_category_slug text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_radius_km numeric default null, p_max_price numeric default null, p_mode text default null,
  p_min_rating numeric default null, p_sort text default 'relevance', p_limit int default 60)
returns table (
  id uuid, name text, description text, price_inr numeric, duration_min int, image_url text,
  at_salon boolean, at_home boolean, is_wedding boolean, category_slug text, category_name text,
  salon_id uuid, salon_name text, salon_slug text, salon_logo text, rating_avg numeric, rating_count int,
  distance_m double precision)
language plpgsql stable set search_path = public, extensions as $$
declare origin geography; q text; r numeric;
begin
  q := nullif(replace(replace(coalesce(trim(p_query), ''), '%', ''), '_', ''), '');
  if p_lat is not null and p_lng is not null then
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid_coordinates' using errcode = '22023'; end if;
    origin := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    r := least(greatest(coalesce(p_radius_km, (select (a.value #>> '{}')::numeric from app_settings a where a.key = 'search_radius_km'), 5), 0.5), 50);
  end if;
  return query
  select ss.id, ss.name, ss.description, ss.price_inr, ss.duration_min, ss.image_url, ss.at_salon, (ss.at_home and s.home_service), ss.is_wedding,
         c.slug, c.name, s.id, s.name, s.slug, s.logo_url, s.rating_avg, s.rating_count,
         case when origin is null or s.location is null then null else st_distance(s.location, origin) end
  from salon_services ss
  join salons s on s.id = ss.salon_id and s.status = 'approved'
  left join service_categories c on c.id = ss.category_id
  where ss.is_active
    and (q is null or ss.name ilike '%' || q || '%' or s.name ilike '%' || q || '%' or c.name ilike '%' || q || '%')
    and (p_category_slug is null or c.slug = p_category_slug)
    and (p_max_price is null or ss.price_inr <= p_max_price)
    and (p_min_rating is null or s.rating_avg >= p_min_rating)
    and (p_mode is null or (p_mode = 'home' and ss.at_home and s.home_service) or (p_mode = 'salon' and ss.at_salon))
    and (origin is null or (s.location is not null and st_dwithin(s.location, origin, r * 1000)))
  order by
    case when p_sort = 'price_asc' then ss.price_inr end asc,
    case when p_sort = 'price_desc' then ss.price_inr end desc,
    case when p_sort = 'rating' then s.rating_avg end desc,
    case when p_sort = 'distance' and origin is not null then st_distance(s.location, origin) end asc,
    s.featured desc, s.rating_avg desc, ss.name asc
  limit least(greatest(p_limit, 1), 200);
end $$;

create extension if not exists pg_cron;
select cron.schedule('lushira-expire-unpaid', '*/10 * * * *', $cron$select public.expire_unpaid_bookings()$cron$);

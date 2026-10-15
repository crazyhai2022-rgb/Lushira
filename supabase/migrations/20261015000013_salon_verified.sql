-- Admin-verified salons (blue tick)
alter table public.salons add column verified boolean not null default false;
alter table public.salons add column verified_at timestamptz;

create or replace function public.salons_before_write()
returns trigger language plpgsql set search_path = '' as $$
declare is_priv boolean;
begin
  is_priv := coalesce((select auth.role()), '') = 'service_role' or private.is_admin();
  if tg_op = 'INSERT' then
    if not is_priv then
      new.status := 'draft'; new.featured := false; new.verified := false; new.verified_at := null;
      new.rating_avg := 0; new.rating_count := 0; new.approved_at := null; new.rejection_reason := null;
    end if;
  else
    if not is_priv then
      new.owner_id := old.owner_id;
      new.featured := old.featured;
      new.verified := old.verified;
      new.verified_at := old.verified_at;
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.approved_at := old.approved_at;
      new.rejection_reason := old.rejection_reason;
      if new.status is distinct from old.status then
        if not (old.status in ('draft','rejected') and new.status = 'pending') then
          new.status := old.status;
        end if;
      end if;
    else
      if new.status = 'approved' and old.status is distinct from 'approved' then new.approved_at := now(); end if;
      if new.verified is distinct from old.verified then new.verified_at := case when new.verified then now() else null end; end if;
    end if;
  end if;
  if new.slug is null then
    new.slug := trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  return new;
end $$;

-- Customer and partner accounts are independent: the same mobile can have one of each.
-- customer: <mobile>@phone.lushira.app (carries auth phone)   partner: <mobile>@partner.lushira.app (mobile kept in metadata)
create or replace function public.auth_user_by_login(p_mobile text, p_kind text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users
  where email = p_mobile || (case when p_kind = 'partner' then '@partner.lushira.app' else '@phone.lushira.app' end)
  limit 1
$$;
revoke execute on function public.auth_user_by_login(text, text) from public, anon, authenticated;
grant execute on function public.auth_user_by_login(text, text) to service_role;
-- handle_new_user also updated (partner domain hidden as email; phone from metadata for partner accounts); existing partner
-- accounts were moved from @phone.lushira.app to @partner.lushira.app.

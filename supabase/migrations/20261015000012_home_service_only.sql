-- Lushira is an at-home service marketplace: every salon/service is delivered at the customer's home
alter table public.salons alter column home_service set default true;
alter table public.salon_services alter column at_home set default true;
alter table public.salon_services alter column at_salon set default false;
update public.salons set home_service = true where home_service is distinct from true;
update public.salon_services set at_home = true, at_salon = false where at_home is distinct from true or at_salon is distinct from false;

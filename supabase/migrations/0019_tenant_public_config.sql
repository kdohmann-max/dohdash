-- Anon-callable: returns ONLY the safe branding subset for the landing/login
-- page, resolved by hostname (subdomain slug or custom domain). Never returns
-- anything sensitive -- it is exposed to unauthenticated visitors.
create or replace function public.get_tenant_public_config(p_hostname text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select t.config
  from public.tenants t
  where t.custom_domain = p_hostname
     or t.slug = split_part(p_hostname, '.', 1)
  limit 1;
$$;

grant execute on function public.get_tenant_public_config(text) to anon, authenticated;

-- Multi-tenant foundation. Additive only: new table, new helper, nullable
-- tenant_id columns. Backfill + NOT NULL + RLS happen in 0017/0018 -- in that
-- order, so we never lock ourselves out of existing data mid-migration.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  custom_domain text unique,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at bigint not null
);

alter table public.tenants enable row level security;

-- Returns the calling user's tenant. SECURITY DEFINER to avoid RLS recursion,
-- mirroring is_admin() in 0001.
create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- Seed tenant #1 = Doh Built Inc. config is transcribed verbatim from the
-- CURRENT public/CompanyInfo.md (frontmatter + trimmed markdown body as `about`)
-- so the Phase 4 loader is a drop-in for what loadCompanyInfo() parsed at runtime.
insert into public.tenants (slug, custom_domain, name, config, created_at)
values (
  'built',
  null,
  'Doh Built Inc.',
  $config$
  {
    "companyName": "Doh Built Inc.",
    "dashboardName": "DohDash",
    "adminContact": { "email": "kdohmann@gmail.com", "phone": "+1 (780) 555-0142" },
    "logo": "/company-logo.svg",
    "appNames": { "tasks": "DohDocs" },
    "styleGuide": {
      "colors": {
        "bg": "#ffffff",
        "bgAlt": "#f9f8f6",
        "border": "#e8e4df",
        "text": "#1f2328",
        "muted": "#6b6b6b",
        "accent": "#c86c2e",
        "accentSoft": "#fef3ee",
        "accentSecondary": "#1e40af",
        "accentTertiary": "#fbbf24",
        "error": "#dc2626",
        "darkBg": "#1a1a1a",
        "darkBgAlt": "#242424",
        "darkBorder": "#3a3a3a",
        "darkText": "#e8e8e8",
        "darkMuted": "#ababab",
        "darkAccent": "#f08d5d",
        "darkAccentSoft": "#5a3426",
        "darkAccentSecondary": "#3b82f6",
        "darkAccentTertiary": "#f59e0b",
        "darkError": "#f07070"
      },
      "typography": {
        "display": { "fontFamily": "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", "fontWeight": 700 },
        "heading": { "fontFamily": "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", "fontWeight": 600 },
        "body": { "fontFamily": "Comfortaa, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", "fontWeight": 400 }
      },
      "rounded": { "sm": "4px", "md": "6px", "lg": "8px" },
      "spacing": { "xs": "4px", "sm": "8px", "md": "12px", "lg": "16px", "xl": "32px" }
    },
    "about": "# Doh Built Inc. — Company Info\n\n## About\n\nDoh Built Inc. is a small construction and field-services company. DohDash is\nour internal company OS: the one place employees sign in to reach the tools\nthey use day to day — job files, tasks, the calendar, contacts, time tracking,\nexpenses, and clean-up scheduling.\n\n## Admin contact\n\nQuestions about account access should go to the admin contact above. New\nemployees won't be able to sign in until an admin grants them access.\n\n## Porting this dashboard to another company\n\nEverything above the `## About` heading is read at runtime — change the\ncompany name, contact info, logo path, and colors here (plus the Supabase\nproject credentials in the deploy environment) and the entire dashboard\nre-brands without touching any source code or rebuilding."
  }
  $config$::jsonb,
  extract(epoch from now())::bigint
);

-- Add tenant_id nullable to every tenant-owned table.
alter table public.profiles          add column tenant_id uuid references public.tenants(id);
alter table public.app_access        add column tenant_id uuid references public.tenants(id);
alter table public.pending_profiles  add column tenant_id uuid references public.tenants(id);
alter table public.access_requests   add column tenant_id uuid references public.tenants(id);
alter table public.admin_audit_log   add column tenant_id uuid references public.tenants(id);
alter table public.notes             add column tenant_id uuid references public.tenants(id);
alter table public.folders           add column tenant_id uuid references public.tenants(id);
alter table public.doc_comments      add column tenant_id uuid references public.tenants(id);
alter table public.groups            add column tenant_id uuid references public.tenants(id);
alter table public.group_members     add column tenant_id uuid references public.tenants(id);
alter table public.note_shares       add column tenant_id uuid references public.tenants(id);
alter table public.folder_shares     add column tenant_id uuid references public.tenants(id);
alter table public.remote_projects   add column tenant_id uuid references public.tenants(id);
alter table public.remote_sessions   add column tenant_id uuid references public.tenants(id);

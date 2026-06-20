-- Map dohdash.vercel.app to the built tenant so the existing Vercel URL
-- resolves branding via custom_domain lookup instead of falling through to
-- "tenant not found". Remove or replace once a real domain is registered.
UPDATE public.tenants SET custom_domain = 'dohdash.vercel.app' WHERE slug = 'built';

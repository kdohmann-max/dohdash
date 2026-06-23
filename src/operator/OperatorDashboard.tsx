import { useEffect, useState } from "react";
import {
  listTenants,
  createTenant,
  updateTenant,
  provisionFirstAdmin,
  type Tenant,
  type TenantInput,
} from "../storage/db";
import type { CompanyInfo } from "../company/types";
import "./OperatorDashboard.css";

// Platform-operator control plane: list every tenant, create one, edit its
// branding config + slug + custom domain, and provision its first admin. Reached
// only by a super admin (OperatorRoute guards it; the nav link is gated too).
//
// Config editing is HYBRID (see plan 2026-06-22, revised after Senate review):
// structured fields for the keys that actually vary per tenant (identity + the
// two accent colors) plus a validated raw-JSON box for everything else, so the
// editor inherits the full CompanyInfo shape automatically and can't drift.

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// The URL a tenant resolves at: a mapped custom domain wins, else its subdomain.
function tenantUrl(slug: string, customDomain: string | null): string {
  return customDomain ? `https://${customDomain}` : `https://${slug}.dohdash.app`;
}

export function OperatorDashboard() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload(selectId?: string) {
    try {
      const list = await listTenants();
      setTenants(list);
      setSelectedId((cur) => selectId ?? cur ?? list[0]?.id ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = tenants?.find((t) => t.id === selectedId) ?? null;
  // Clone source for new tenants: prefer 'built' (the canonical seed), else the
  // first tenant. Guarantees a new tenant inherits the current full config shape.
  const cloneSource = tenants?.find((t) => t.slug === "built") ?? tenants?.[0] ?? null;

  return (
    <div className="operator">
      <h1>Operator</h1>
      <p className="operator-subtitle">Manage every tenant on the platform.</p>
      {error ? <p className="operator-error">{error}</p> : null}

      {tenants === null ? (
        <p className="operator-status">Loading tenants…</p>
      ) : (
        <div className="operator-body">
          <div className="operator-left">
            <div className="operator-list-head">
              <span className="operator-list-title">Tenants ({tenants.length})</span>
              <button
                className="operator-new-btn"
                onClick={() => {
                  setCreating(true);
                  setSelectedId(null);
                }}
              >
                + New
              </button>
            </div>
            <ul className="operator-list">
              {tenants.length === 0 ? (
                <li className="operator-empty">No tenants yet</li>
              ) : (
                tenants.map((t) => (
                  <li
                    key={t.id}
                    className={`operator-list-item${t.id === selectedId && !creating ? " active" : ""}`}
                    onClick={() => {
                      setSelectedId(t.id);
                      setCreating(false);
                    }}
                  >
                    <span className="operator-list-name">{t.name}</span>
                    <span className="operator-list-slug">{t.slug}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="operator-right">
            {creating ? (
              <CreateTenantForm
                cloneSource={cloneSource}
                existingSlugs={tenants.map((t) => t.slug)}
                onCancel={() => setCreating(false)}
                onCreated={(id) => {
                  setCreating(false);
                  void reload(id);
                }}
                onError={setError}
              />
            ) : !selected ? (
              <p className="operator-no-selection">Select a tenant, or create a new one.</p>
            ) : (
              <TenantDetail
                key={selected.id}
                tenant={selected}
                existingSlugs={tenants.filter((t) => t.id !== selected.id).map((t) => t.slug)}
                onSaved={() => void reload(selected.id)}
                onError={setError}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- shared branding field helpers ----

interface BrandingFields {
  companyName: string;
  dashboardName: string;
  adminEmail: string;
  adminPhone: string;
  logo: string;
  accent: string;
  accentSecondary: string;
}

function brandingFromConfig(config: CompanyInfo): BrandingFields {
  return {
    companyName: config.companyName ?? "",
    dashboardName: config.dashboardName ?? "",
    adminEmail: config.adminContact?.email ?? "",
    adminPhone: config.adminContact?.phone ?? "",
    logo: config.logo ?? "",
    accent: config.styleGuide?.colors?.accent ?? "#c86c2e",
    accentSecondary: config.styleGuide?.colors?.accentSecondary ?? "#1e40af",
  };
}

// Overlay the structured branding fields onto a base config object. Structured
// fields win for the keys they own; the raw-JSON base supplies everything else.
function applyBranding(base: CompanyInfo, b: BrandingFields): CompanyInfo {
  return {
    ...base,
    companyName: b.companyName,
    dashboardName: b.dashboardName,
    adminContact: { email: b.adminEmail, phone: b.adminPhone },
    logo: b.logo,
    styleGuide: {
      ...base.styleGuide,
      colors: { ...base.styleGuide.colors, accent: b.accent, accentSecondary: b.accentSecondary },
    },
  };
}

function BrandingInputs({
  value,
  onChange,
}: {
  value: BrandingFields;
  onChange: (next: BrandingFields) => void;
}) {
  const set = (patch: Partial<BrandingFields>) => onChange({ ...value, ...patch });
  return (
    <>
      <label className="operator-field">
        <span>Company name</span>
        <input value={value.companyName} onChange={(e) => set({ companyName: e.target.value })} />
      </label>
      <label className="operator-field">
        <span>Dashboard name</span>
        <input value={value.dashboardName} onChange={(e) => set({ dashboardName: e.target.value })} />
      </label>
      <label className="operator-field">
        <span>Admin email</span>
        <input value={value.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} />
      </label>
      <label className="operator-field">
        <span>Admin phone</span>
        <input value={value.adminPhone} onChange={(e) => set({ adminPhone: e.target.value })} />
      </label>
      <label className="operator-field">
        <span>Logo path</span>
        <input value={value.logo} onChange={(e) => set({ logo: e.target.value })} />
      </label>
      <label className="operator-field">
        <span>Accent color</span>
        <span className="operator-color-row">
          <input
            type="color"
            value={value.accent}
            onChange={(e) => set({ accent: e.target.value })}
          />
          <input value={value.accent} onChange={(e) => set({ accent: e.target.value })} />
        </span>
      </label>
      <label className="operator-field">
        <span>Secondary accent</span>
        <span className="operator-color-row">
          <input
            type="color"
            value={value.accentSecondary}
            onChange={(e) => set({ accentSecondary: e.target.value })}
          />
          <input
            value={value.accentSecondary}
            onChange={(e) => set({ accentSecondary: e.target.value })}
          />
        </span>
      </label>
    </>
  );
}

// ---- create ----

function CreateTenantForm({
  cloneSource,
  existingSlugs,
  onCancel,
  onCreated,
  onError,
}: {
  cloneSource: Tenant | null;
  existingSlugs: string[];
  onCancel: () => void;
  onCreated: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [branding, setBranding] = useState<BrandingFields>(() => ({
    companyName: "",
    dashboardName: "",
    adminEmail: "",
    adminPhone: "",
    logo: "/company-logo.svg",
    accent: "#c86c2e",
    accentSecondary: "#1e40af",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit() {
    const s = slug.trim().toLowerCase();
    if (!SLUG_RE.test(s)) {
      setLocalError("Slug must be lowercase letters, numbers, and hyphens (it becomes a subdomain).");
      return;
    }
    if (existingSlugs.includes(s)) {
      setLocalError(`Slug "${s}" is already taken.`);
      return;
    }
    if (!name.trim()) {
      setLocalError("Company name is required.");
      return;
    }
    if (!cloneSource) {
      setLocalError("No existing tenant to clone the config shape from.");
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    try {
      // Clone the source config so the new tenant inherits the current full
      // CompanyInfo shape, then overlay the structured branding fields.
      const base: CompanyInfo = JSON.parse(JSON.stringify(cloneSource.config));
      const config = applyBranding(base, {
        ...branding,
        companyName: branding.companyName || name.trim(),
        dashboardName: branding.dashboardName || `${name.trim()} Dashboard`,
      });
      const input: TenantInput = {
        slug: s,
        name: name.trim(),
        customDomain: customDomain.trim() || null,
        config,
      };
      const created = await createTenant(input);
      onCreated(created.id);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="operator-form">
      <h2 className="operator-detail-name">New tenant</h2>
      <label className="operator-field">
        <span>Slug (subdomain)</span>
        <input
          value={slug}
          placeholder="acme"
          onChange={(e) => setSlug(e.target.value)}
          autoFocus
        />
      </label>
      <label className="operator-field">
        <span>Company name</span>
        <input value={name} placeholder="Acme Corp" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="operator-field">
        <span>Custom domain (optional)</span>
        <input
          value={customDomain}
          placeholder="app.acme.com"
          onChange={(e) => setCustomDomain(e.target.value)}
        />
      </label>
      <p className="operator-form-hint">
        Branding defaults to the company name; tweak below or edit after creating. Everything not shown
        here is cloned from <strong>{cloneSource?.slug ?? "—"}</strong>.
      </p>
      <BrandingInputs value={branding} onChange={setBranding} />
      {localError ? <p className="operator-error">{localError}</p> : null}
      <div className="operator-form-actions">
        <button className="operator-primary-btn" disabled={submitting} onClick={() => void handleSubmit()}>
          {submitting ? "Creating…" : "Create tenant"}
        </button>
        <button className="operator-link-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- edit + provision ----

function TenantDetail({
  tenant,
  existingSlugs,
  onSaved,
  onError,
}: {
  tenant: Tenant;
  existingSlugs: string[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [customDomain, setCustomDomain] = useState(tenant.customDomain ?? "");
  const [branding, setBranding] = useState<BrandingFields>(() => brandingFromConfig(tenant.config));
  const [configJson, setConfigJson] = useState(() => JSON.stringify(tenant.config, null, 2));
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);

  async function handleSave() {
    const s = slug.trim().toLowerCase();
    if (!SLUG_RE.test(s)) {
      setLocalError("Slug must be lowercase letters, numbers, and hyphens.");
      return;
    }
    if (existingSlugs.includes(s)) {
      setLocalError(`Slug "${s}" is already taken by another tenant.`);
      return;
    }
    let base: CompanyInfo;
    try {
      base = JSON.parse(configJson);
    } catch {
      setLocalError("Config JSON is invalid — fix it before saving.");
      return;
    }
    setSaving(true);
    setLocalError(null);
    setSaved(false);
    try {
      // Structured branding fields win over the raw JSON for the keys they own.
      const config = applyBranding(base, branding);
      await updateTenant(tenant.id, {
        name: name.trim(),
        slug: s,
        customDomain: customDomain.trim() || null,
        config,
      });
      setConfigJson(JSON.stringify(config, null, 2));
      setSaved(true);
      onSaved();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleProvision() {
    const email = adminEmail.trim();
    if (!email) return;
    setProvisioning(true);
    setProvisionMsg(null);
    try {
      await provisionFirstAdmin(tenant.id, email);
      setProvisionMsg(`Invited ${email} as admin — they become active on first Google sign-in.`);
      setAdminEmail("");
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setProvisioning(false);
    }
  }

  const url = tenantUrl(slug.trim() || tenant.slug, customDomain.trim() || null);

  return (
    <div className="operator-form">
      <h2 className="operator-detail-name">{tenant.name}</h2>

      <section className="operator-section">
        <h3 className="operator-section-title">Identity</h3>
        <label className="operator-field">
          <span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="operator-field">
          <span>Slug (subdomain)</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        <label className="operator-field">
          <span>Custom domain</span>
          <input
            value={customDomain}
            placeholder="(none — uses subdomain)"
            onChange={(e) => setCustomDomain(e.target.value)}
          />
        </label>
        <p className="operator-form-hint">
          URL:{" "}
          <a href={url} target="_blank" rel="noreferrer" className="operator-url">
            {url}
          </a>
        </p>
      </section>

      <section className="operator-section">
        <h3 className="operator-section-title">Branding</h3>
        <BrandingInputs value={branding} onChange={setBranding} />
      </section>

      <section className="operator-section">
        <h3 className="operator-section-title">Full config (advanced)</h3>
        <p className="operator-form-hint">
          Everything else in the config. The branding fields above override their keys on save.
        </p>
        <textarea
          className="operator-json"
          value={configJson}
          spellCheck={false}
          rows={12}
          onChange={(e) => setConfigJson(e.target.value)}
        />
      </section>

      {localError ? <p className="operator-error">{localError}</p> : null}
      <div className="operator-form-actions">
        <button className="operator-primary-btn" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved ? <span className="operator-saved">Saved ✓</span> : null}
      </div>

      <section className="operator-section">
        <h3 className="operator-section-title">First admin</h3>
        <p className="operator-form-hint">
          Invite this tenant's first admin by email. They can then manage their own users in-app.
        </p>
        <div className="operator-provision-row">
          <input
            value={adminEmail}
            placeholder="admin@acme.com"
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <button
            className="operator-secondary-btn"
            disabled={provisioning || !adminEmail.trim()}
            onClick={() => void handleProvision()}
          >
            {provisioning ? "Inviting…" : "Invite admin"}
          </button>
        </div>
        {provisionMsg ? <p className="operator-success">{provisionMsg}</p> : null}
      </section>

      <OnboardingChecklist
        url={url}
        slug={slug.trim() || tenant.slug}
        customDomain={customDomain.trim() || null}
      />
    </div>
  );
}

// The shared Supabase OAuth callback (one for the whole platform — derived from
// the project URL so it stays correct if the project is ever swapped).
const SUPABASE_CALLBACK = `${import.meta.env.VITE_SUPABASE_URL ?? "https://<project>.supabase.co"}/auth/v1/callback`;

// The steps DohDash can't do for you — DNS + OAuth wiring per tenant. Branches on
// whether the tenant uses a mapped custom domain or a *.dohdash.app subdomain,
// because the DNS step differs. Steps 2 & 3 are required for sign-in to work.
function OnboardingChecklist({
  url,
  slug,
  customDomain,
}: {
  url: string;
  slug: string;
  customDomain: string | null;
}) {
  const isApex = customDomain ? !customDomain.includes(".", customDomain.indexOf(".") + 1) : false;
  return (
    <section className="operator-section operator-checklist">
      <h3 className="operator-section-title">Go-live checklist (manual)</h3>
      <p className="operator-form-hint">
        These three steps happen outside DohDash. The customer can't sign in until steps 2 and 3 are
        done. Test at the end by opening <code>{url}</code> in a private window.
      </p>

      <ol className="operator-steps">
        <li>
          <strong>Point the URL at DohDash</strong>
          {customDomain ? (
            <ul>
              <li>
                Vercel → the DohDash project → <em>Settings → Domains</em> → add{" "}
                <code>{customDomain}</code>.
              </li>
              <li>
                At the domain's DNS provider, add the record Vercel shows:
                <ul>
                  {isApex ? (
                    <li>
                      Apex domain — <code>A</code> record, host <code>@</code>, value{" "}
                      <code>76.76.21.21</code>.
                    </li>
                  ) : (
                    <li>
                      Subdomain — <code>CNAME</code> record pointing to{" "}
                      <code>cname.vercel-dns.com</code>.
                    </li>
                  )}
                </ul>
              </li>
              <li>
                Wait until Vercel shows <em>Valid Configuration</em> and issues the SSL certificate
                (usually a few minutes, up to ~1 hour for DNS).
              </li>
            </ul>
          ) : (
            <ul>
              <li>
                This tenant uses its subdomain <code>{slug}.dohdash.app</code>. Once the{" "}
                <code>*.dohdash.app</code> wildcard domain is live in Vercel, the subdomain resolves
                automatically — no per-tenant DNS.
              </li>
              <li>
                <code>dohdash.app</code> isn't registered yet — until it is, either map a custom domain
                above, or set <code>VITE_DEV_TENANT_SLUG={slug}</code> in <code>.env.local</code> to test
                locally at <code>localhost:5173</code>.
              </li>
            </ul>
          )}
        </li>

        <li>
          <strong>Allow the redirect in Supabase</strong>
          <span className="operator-req">required</span>
          <ul>
            <li>
              Supabase Dashboard → the DohDash project → <em>Authentication → URL Configuration</em>.
            </li>
            <li>
              Under <em>Redirect URLs</em>, click <em>Add URL</em> and enter <code>{url}/**</code>. The{" "}
              <code>/**</code> wildcard covers the post-login callback path.
            </li>
            <li>
              For <code>*.dohdash.app</code> subdomains you can instead add{" "}
              <code>https://*.dohdash.app/**</code> once, covering every subdomain tenant.
            </li>
            <li>Click <em>Save</em>.</li>
          </ul>
        </li>

        <li>
          <strong>Authorize the domain in Google</strong>
          <span className="operator-req">required</span>
          <ul>
            <li>
              Google Cloud Console → <em>APIs &amp; Services → Credentials</em> → the DohDash OAuth 2.0
              Client ID.
            </li>
            <li>
              Under <em>Authorized JavaScript origins</em>, add <code>{url}</code> (origin only, no
              path).
            </li>
            <li>
              Under <em>Authorized redirect URIs</em>, confirm the shared Supabase callback is present
              (add it only if missing — it's the same for every tenant):{" "}
              <code>{SUPABASE_CALLBACK}</code>.
            </li>
            <li>
              Click <em>Save</em>. Google changes can take 5 minutes to a few hours to take effect.
            </li>
          </ul>
        </li>
      </ol>
    </section>
  );
}

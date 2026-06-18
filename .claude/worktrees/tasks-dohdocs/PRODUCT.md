# Product

## Register

product

## Users

Employees of a small-to-mid-size company who need one place to reach the tools they use day to day — Job Files, Tasks, Calendar, Contacts, Time Tracker, Expense Tracker, Clean Up — without hunting through bookmarks or scattered logins. Admins (there can be more than one) decide who sees which apps. The audience skews non-technical: the portal has to be self-explanatory on first login, with no onboarding tour.

## Product Purpose

DohDash is a company OS: a single branded front door an employee signs into once (Google) and from which every company app is one click away — gated by exactly what an admin has granted them. It exists to replace "which tab/bookmark/login was that tool again?" with "open DohDash, click the tile." Success looks like: nobody has to ask where a tool lives, and an admin can grant or revoke someone's access in seconds without touching code or a database console.

A second job: be **portable**. The same codebase should stand up a fresh, differently-branded instance for another company by swapping one file (`CompanyInfo.md`) plus a logo and a set of Supabase credentials — no source changes, no rebuild.

## Design Principles

These describe the parts of DohDash that *aren't* re-skinned per company — the shell, launcher, and admin surfaces. Visual identity (colors, type, logo, copy) is driven entirely by `CompanyInfo.md`; these principles are about how the app behaves and feels structurally, regardless of whose skin it's wearing.

1. **The launcher is a picker, not a dashboard.** It's a clean grid of tiles for the apps you're allowed to open — not a wall of widgets, metrics, or activity feeds competing for attention. One job: get you to the right app.
2. **Permissions are visible, not mysterious.** What you can't see, you can't open — there's no "request access" dead end inside an app you were never granted. The admin side mirrors this: granting and revoking access are each one click, and people who've been granted access but haven't signed in yet show up as visible "pending invitations," not silent gaps.
3. **Honest states, everywhere.** Loading, empty, error, "coming soon," and "access pending" states are plain and calm — no marketing copy, and never a dead end without an explanation or a next step ("access pending" links straight to the admin's email).
4. **Top bar, not sidebar.** The launcher's job is "pick a destination," not "browse a hierarchy" — a horizontal bar (brand, nav, signed-in user) plus a content pane fits that better than a navigation-heavy sidebar would.
5. **Stub-first, build later.** Every app starts as a named, iconed, described "coming soon" page reachable through the real permission system. The navigation and permission skeleton is real and live from day one; what's behind each tile fills in over time without changing how it's reached or gated.

## Accessibility & Inclusion

Best effort: legible contrast in both the light and dark variants a `CompanyInfo.md` style guide can define (≥4.5:1 for body text), keyboard-navigable core flows (sign in, launch an app, toggle a permission as admin), `aria-hidden` on decorative icons, and empty `alt=""` on the company logo since the adjacent dashboard name already carries its meaning.

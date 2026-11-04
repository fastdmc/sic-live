# Chunk 06: web shell, sign-in and site switching

**Depends on:** 03 (04 for real data on screen).
**Goal:** the app frame people will live in: sign-in (MSAL or dev picker), navigation, site switcher, freshness, bell, themes, and the API client, matching the mockup.

## Read first
`docs/DESIGN.md`, `docs/ARCHITECTURE.md` (Sign-in), `reference/mockup/SIC Live - HFI Drogheda.html` (open it), `reference/mockup/app.css` (shell section).

## Tasks
1. `apps/web/src/styles/`: `tokens.css` (from DESIGN), `base.css`, `shell.css`; RAG shape component `<Rag value="G|A|R|null" />` with a text alternative.
2. Auth:
   - `VITE_AUTH_MODE=entra`: `@azure/msal-browser` + `@azure/msal-react`, authority `https://login.microsoftonline.com/organizations`, redirect flow, scope `api://<client-id>/access_as_user`, silent token renewal, sign-out. Refuse tenants not in `VITE_ALLOWED_TENANT_IDS` with a clear page.
   - `VITE_AUTH_MODE=dev`: a "Sign in as" page listing `fixtures/users.json` people with their roles; sends `x-dev-user`.
3. `src/api/client.ts`: typed fetch wrapper using the shared zod schemas to parse every response; attaches the token or dev header; turns `{ error }` into a typed error the UI shows. TanStack Query provider with sensible defaults (stale 15 s, retry 1, no retry on 4xx).
4. Shell (React Router 6): left nav (Site, Areas, Lines, Actions, My actions, Escalations, Inbox, Admin for site admins), collapsible; top bar with site switcher (from `/api/me`), date picker (from `/days`), freshness "Updated 06:42" from `/sic/version` (data age = `serverNow - refreshedUtc` at the last successful poll plus the time since that poll; amber at 20 minutes, red at 60), bell with unread inbox count (poll 30 s), theme toggle (light, dark, system; remembered in localStorage), user menu with sign-out.
5. Routes as in `docs/SPEC.md` with placeholder pages for screens built later; `/` redirects to the person's last site (or a picker when they have several and no last site); `/sites/:site` shows that site, or a 403 page when the person has no role there ("You do not have access to <site>. Ask a site admin.").
6. Error boundary, loading skeletons, offline banner (navigator.onLine and failed polls).

## Out of scope
The SIC, action, inbox and admin screens' content.

## Acceptance checks
- Vitest + Testing Library: the shell renders for Lena with HFI selected; Greta sees a site switcher with HFI, HFUK and DEMO; Uma (HFUK viewer) does not see Admin.
- Playwright (dev mode, fake API on 7071, web on 5173): sign in as Lena, see "Hilton Foods Ireland, Drogheda", the bell, and "Updated" in the top bar; switch theme and reload keeps it; navigate to `/sites/DEMO` as Lena and see the 403 page.
- Axe check (`@axe-core/playwright`) on the shell: no serious or critical violations in light and dark.
- `pnpm check` passes.

---
feature: staff-auth
ready: yes
updated: 2026-11-02
owner: designer
milestone: M1
features: staff-auth
---

# Staff authentication

## Goal
Staff sign in with a named account and every staff route of the API is closed
to anyone else. Operators create and deactivate accounts from the command line.
The web app gets its shell (top bar with the staff member's name and Log out)
and the login page. Success: an unauthenticated request to any staff route gets
401; a staff member logs in, sees the shell, logs out, and an expired session
returns them to login and then to the page they were on.

## Out of scope
- Roles or permissions (all staff are equal), user-management screens, self
  sign-up, password change by the user, "forgot password" by email (no email).
- The API key of `POST /orders` (belongs to `order-intake`).
- The orders list and detail screens (`orders-list`, `order-detail`).

## User flows
1. **Create an account** (operator): `npm run user:create -w services/orders --
   --email <e> --name <n>`. The password is prompted (hidden); when stdin is not
   a terminal it is read from stdin; never a flag or an environment variable.
   Email is trimmed and lowercased, unique case-insensitively. Errors: email
   already used (also when deactivated); password shorter than 12 characters;
   invalid email; empty name.
2. **Deactivate an account** (operator): `user:deactivate --email <e>`: sets
   inactive and deletes its sessions. Error: unknown email.
2b. **Set a password** (operator): `user:set-password --email <e>`, same
   password input and rules; deletes that account's sessions. Error: unknown
   email.
3. **Log in**: email + password → 200 with the StaffUser and the session
   cookie. Errors: wrong email/password or deactivated → 401, one generic
   message (an unknown email still costs one password hash, so timing does not
   reveal it); locked → 429 with `Retry-After`; invalid body → 422. Lockout: 5
   failures for an email within 15 minutes (unknown emails counted too) lock it
   for 15 minutes from the last failure; attempts during the lock do not extend
   it and a success does not reset the count. `LoginAttempt` rows older than 24
   hours are deleted at login, with expired sessions. No per-IP limit.
4. **Use the app**: every request is authenticated by the cookie. The session
   is 8 hours idle (sliding; `lastSeenAt` written at most once a minute) and
   at most 24 hours from login. No/expired/unknown session, or a deactivated
   user → 401. The guard is driven by the contract's `security`: staff routes
   answer 401 without a session even while their feature is still 501.
   Mutating staff requests must be JSON with `Origin` equal to `PUBLIC_ORIGIN`
   (missing or different → 403).
5. **Expiry in the web app**: any 401 on a staff request sends the user to
   `/login?next=<path>`; after login they return to `next`.
6. **Log out**: `POST /auth/logout` deletes the session on the server and
   clears the cookie; the web app goes to `/login`.

## Screens and states
| Screen / component | States | Notes |
|---|---|---|
| Login | idle, submitting (button busy, `aria-busy`), field errors (empty/invalid email checked in the browser, 422), wrong credentials, locked (429), service unavailable (503 or network, Retry) | title "Log in"; fields "Email", "Password"; button "Log in". Wrong credentials or deactivated: "Wrong email or password." Locked: "Too many attempts. Try again in N minutes." (`Retry-After` rounded up). Down: "Can't reach the service." + Retry. After a failure the email stays, the password is cleared, focus goes to the error. A signed-in user opening `/login` is sent to `next` or `/`. |
| App shell | checking session (spinner, `aria-busy`), signed in, error (Retry) | top bar: "Orders", staff name, Log out; content outlet. At `/` the outlet holds the existing health panel ("Orders — API ok"), replaced by `orders-list` in M2. |

`next` is accepted only as a path on this site starting with a single `/`
(never `//` or a full URL); otherwise `/`.

Responsive: usable from 320 px; top bar wraps. Accessibility: labelled fields,
`autocomplete` username / current-password, errors announced (`role=alert`),
focus to the error, keyboard only.
Tokens: design system only; none new proposed.

## Data and API
Entities (project design): StaffUser (id, email unique lower-case, name,
passwordHash Argon2id, active, createdAt), Session (tokenHash, userId,
createdAt, lastSeenAt, expiresAt), LoginAttempt (email, at, success). The
session token is 256 random bits; the database stores its HMAC-SHA-256 keyed
with `SESSION_SECRET`. Cookie `session`: HttpOnly, SameSite=Lax, Secure when
`NODE_ENV=production`, path `/`.
Contract: `/auth/login`, `/auth/logout`, `/auth/me` already exist in
`openapi.yaml`; add the 403 problem response (Origin check) to the mutating
operations. Additive, not breaking.
Environment: new `PUBLIC_ORIGIN` (default `http://localhost:5173` in
development, required in production), alignment change for devops
(`.env.example`, `compose.yml`). `SESSION_SECRET` is already planned.
Breaking for existing clients: no.

## Acceptance criteria
- [ ] `user:create` creates an account (password via stdin in tests) and
      stores an Argon2id hash, never the password; a duplicate email
      (any case), a password under 12 characters and an invalid email each fail
      with a clear message and a non-zero exit code.
- [ ] `user:deactivate` and `user:set-password` delete the account's sessions;
      an unknown email fails with a non-zero exit code.
- [ ] `POST /auth/login` with valid credentials returns 200 with the StaffUser
      and a `session` cookie (HttpOnly, SameSite=Lax; Secure in production);
      wrong password, unknown email and deactivated account return the same 401
      body; `{}` returns 422.
- [ ] After 5 failed logins for an email within 15 minutes, the sixth attempt
      (even with the right password) returns 429 with `Retry-After`; it works
      again 15 minutes after the last failure (clock controlled in the test).
- [ ] `GET /auth/me` returns the user with the cookie and 401 without it, with
      an expired session (8 h idle, 24 h absolute) and for a deactivated user.
- [ ] `POST /auth/logout` returns 204, clears the cookie, and the same cookie
      then gets 401 on `/auth/me`.
- [ ] Every staff operation of the contract returns 401 without a session
      (a test iterates the contract's `security`); `POST /orders` is not
      affected.
- [ ] A mutating staff request with a wrong or missing `Origin`, or without a
      JSON content type, returns 403 and changes nothing.
- [ ] Responses carry the CSP (no inline scripts), `X-Content-Type-Options`,
      frame denial, and HSTS when `NODE_ENV=production`.
- [ ] No log line contains an email, a password or a token (test on the log
      output of a login).
- [ ] Web: the login page and the shell pass the UI tests at 320, 768 and 1280
      with no axe violations, no horizontal scroll, touch targets of 44 px.
- [ ] Web: a 401 on any staff request lands on `/login?next=<path>`; after a
      successful login the user is on `<path>`; an external `next` is ignored.
- [ ] Web: Log out returns to `/login`, and the browser Back button does not
      show the shell again without a session.
- [ ] CI is green, including the dependency, license and vulnerability scans
      for `argon2` and `react-router`.

## Test seams
- CLI: the three commands run as child processes against the test database,
  password on stdin; catches validation, hashing, exit codes; misses the
  interactive hidden prompt (checked by hand once).
- API: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` and one staff
  route (`GET /orders`), integration tests with `app.inject` on the test
  database and a controllable clock; catches sessions, lockout, expiry, Origin,
  headers, 401 guard; misses real cookies in a browser and the proxy.
- Contract: the existing contract test, extended with the 403 responses.
- UI: the login page and the shell at 320, 768 and 1280, API mocked with
  `page.route()` (success, 401, 422, 429, 503, expired session); catches
  layout, accessibility, redirects and states; misses the real API.

## Reuse
- Argon2id hashing: third-party `argon2` (node-argon2, MIT, prebuilt binaries);
  backend runs the dependency checklist and reports it in the MR.
- Web routing: third-party `react-router` (MIT) for routes, `next` redirects
  and later URL-held list state.
- Security headers: written here, a small Fastify hook (no plugin).
- Everything else (tokens, HMAC, prompts): Node built-ins.

## Decisions
- 2026-11-02 — Spec starts from the staff flows of `project.md` — decided in
  the project design.
- 2026-11-02 — Added `user:set-password` and stdin password input — no email,
  so a forgotten password needs an operator; scripts and tests need non-TTY.
- 2026-11-02 — Lockout counts unknown emails, runs 15 min from the last
  failure, is not extended or reset; no per-IP limit — no account enumeration,
  small shop.
- 2026-11-02 — Session 8 h idle plus 24 h absolute cap, `lastSeenAt` at most
  once a minute — bounded exposure of a stolen cookie, few writes.
- 2026-11-02 — CSRF: JSON + `Origin` equals `PUBLIC_ORIGIN`; security headers
  set by the API — follows the project design's security section.
- 2026-11-02 — The shell shows the health panel at `/` until `orders-list` —
  keeps the existing UI tests meaningful, nothing throwaway to write.
- 2026-11-02 — Login copy, `next` limited to same-site paths, signed-in users
  skip `/login` — as in "Screens and states".
- 2026-11-02 — Four tasks: schema and commands first, then the API, then
  devops and web in parallel — one role and service per row.
- 2026-11-02 — Reuse `argon2` and `react-router` — maintained, MIT, no need to
  write either.

## Open questions
- (none)

## Task breakdown
| # | Role | Task | Depends on | Issue |
|---|---|---|---|---|
| 1 | backend | [orders] Schema and migration for StaffUser, Session and LoginAttempt (Drizzle); Argon2id hashing with `argon2`; commands `user:create`, `user:deactivate`, `user:set-password` (password hidden prompt or stdin); tests | — | - |
| 2 | backend | [orders] `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; session guard driven by the contract's `security`; lockout; session expiry and cleanup; Origin/JSON check; security headers; `PUBLIC_ORIGIN` in the config; 403 responses in `openapi.yaml`; integration and contract tests | 1 | - |
| 3 | devops | [orders] `PUBLIC_ORIGIN` and `SESSION_SECRET` in `.env.example`, `compose.yml` and the CI orders job | 2 | - |
| 4 | frontend | [web] `react-router`; auth provider on `GET /auth/me`; login page; app shell with top bar and Log out; 401 handling in the client with the `next` redirect; health panel moved into the shell; Vitest and Playwright UI tests at 320, 768, 1280; regenerate `schema.d.ts` | 2 | - |

## Readiness checklist
- [x] goal, users and out of scope agreed
- [x] every flow has its error and edge cases
- [x] every screen has empty, loading, error and success states
- [x] contract changes written, breaking changes approved by the user
- [x] acceptance criteria are observable
- [x] test seams agreed
- [x] reuse decided: team libraries and new dependencies named, or "none"
- [x] task breakdown with roles and dependencies
- [x] no open questions

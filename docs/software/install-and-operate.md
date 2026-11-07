# Install and operate Orders locally

Written against: e025c2ffda74749627dd921c62b4f29fda9692c2 (2026-11-07)

For developers and operators who run Orders on their own computer. There is no
deployment target yet: everything here is local, with development credentials.
How staff use the app once it runs is in [user-manual.md](user-manual.md).

## What runs

| Part | Folder | Local address |
|---|---|---|
| Postgres 17 | `compose.yml` (service `postgres`) | `localhost:5432`, user, password and database `orders` |
| orders API (Fastify) | `services/orders/` | http://localhost:3000 (`/api/v1/...`, `/health`) |
| web app (React) | `apps/web/` | http://localhost:5173 |
| `@albertoriorda95/money` | `packages/money/` | a library, installed from GitHub Packages |

The web app and the API share one origin: in development the Vite server on
port 5173 forwards `/api` and `/health` to port 3000 (`apps/web/vite.config.ts`);
in the containers nginx does the same (`apps/web/nginx.conf`). Always open the
app on http://localhost:5173, not on port 3000.

You can run Orders in two ways:

- **Development mode**: Postgres in Docker, the API and the web app with npm,
  with reload on save. Use it to work on the code.
- **Full stack in containers**: Postgres, the API and the web app all in Docker
  Compose, built like a release (the API runs with `NODE_ENV=production`).

## Requirements

- Node.js 24 (`.nvmrc` says `24`; `package.json` accepts `>=24 <25`) and the npm
  that comes with it.
- Docker with Docker Compose v2 (`docker compose`, not `docker-compose`).
- `git`, and `openssl` to generate the secrets.
- A GitHub personal access token with the `read:packages` scope: the `money`
  library comes from GitHub Packages, which needs a token even to read.
- Free ports 3000, 5173 and 5432.

## 1. Get the code

```sh
git clone https://github.com/AlbertoRiorda95/agent-team-demo.git
cd agent-team-demo
```

All the commands below run from the repository root.

## 2. Log in to the package registry

Give npm read access to GitHub Packages once per computer. The script writes
the token into your user npm configuration (`~/.npmrc`), never into the
repository:

```sh
export REGISTRY_TOKEN=<your token with read:packages>
./ci/registry.sh login
```

It prints `registry: login done (custom, https://npm.pkg.github.com/)`. The
committed `.npmrc` maps the `@albertoriorda95` scope to that registry. The same
user configuration is mounted into the image builds as a build secret
(`compose.yml` > `secrets`); set `NPM_USERCONFIG` if yours is not `~/.npmrc`.

## 3. Install the dependencies

```sh
npm ci
npm ci --prefix packages/money
```

The first command installs the two workspaces (`services/orders`, `apps/web`);
`packages/money` is a separate npm project with its own lockfile, hence the
second one. If `npm ci` fails with a 401 or 403 on `@albertoriorda95/money`,
step 2 is missing or the token has no `read:packages`.

## 4. Configure the environment

Copy the example file and fill in the two secrets:

```sh
cp .env.example .env
openssl rand -hex 32   # paste as SESSION_SECRET
openssl rand -hex 32   # paste as ORDER_API_KEY
```

`.env` is git-ignored. Docker Compose reads it, and so do the npm scripts of
`services/orders` (`dev`, `db:migrate`, `seed`, `user:*`), which load
`../../.env` when it exists.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none: required | Postgres connection string, `postgres://` or `postgresql://`. The example points to the Compose Postgres: `postgres://orders:orders@localhost:5432/orders`. |
| `PORT` | `3000` | Port of the API. |
| `PUBLIC_ORIGIN` | `http://localhost:5173` | Origin of the web app (`scheme://host[:port]`, no path). Requests that change data must send this `Origin`. Required when `NODE_ENV=production`. |
| `SESSION_SECRET` | none | Key that protects the session tokens, at least 32 characters. In development mode it may stay empty: the API then uses a random key and every restart logs everybody out. Required by `docker compose`. |
| `ORDER_API_KEY` | none | Key of the order source for `POST /api/v1/orders` (`Authorization: Bearer <key>`), at least 32 characters. Empty in development mode: that route answers 401 to every request. Required by `docker compose`. |
| `NODE_ENV` | unset | `production` turns on the Secure cookie and HSTS and makes `PUBLIC_ORIGIN`, `SESSION_SECRET` and `ORDER_API_KEY` required. The API image sets it. |

Fill `SESSION_SECRET` and `ORDER_API_KEY` before any `docker compose` command:
`compose.yml` refuses to start without them.

## 5a. Run in development mode

1. Start Postgres and wait until it is healthy:

   ```sh
   docker compose up -d postgres
   docker compose ps          # postgres ... (healthy)
   ```

2. Create the tables (applies every pending migration in
   `services/orders/migrations/`):

   ```sh
   npm run db:migrate -w services/orders
   ```

   It prints `Migrations applied.`

3. Start the API, in its own terminal:

   ```sh
   npm run dev -w services/orders
   ```

4. Start the web app, in another terminal:

   ```sh
   npm run dev -w apps/web
   ```

5. Check that the API sees the database:

   ```sh
   curl http://localhost:5173/health
   ```

   `{"status":"ok"}` means ready; `{"status":"unavailable"}` (HTTP 503) means
   the API cannot reach Postgres.

Then create a staff account (step 6) and open http://localhost:5173.

## 5b. Run the full stack in containers

1. Build and start Postgres, the API and the web app:

   ```sh
   docker compose up -d --build
   ```

2. The API image does not apply migrations when it starts. Apply them from your
   computer, through the Postgres port that Compose publishes (the
   `DATABASE_URL` of `.env` points to `localhost:5432`):

   ```sh
   npm run db:migrate -w services/orders
   ```

3. Check the health as in 5a step 5, create a staff account (step 6) and open
   http://localhost:5173. Here port 5173 is nginx in the `web` container, not
   Vite.

Stop the containers with `docker compose down`; the data stays in the
`pgdata` volume.

## 6. Create a staff account

There is no sign-up screen: staff accounts are created on the command line,
with the API's database (`DATABASE_URL`) reachable:

```sh
npm run user:create -w services/orders -- --email anna@example.com --name "Anna Rossi"
```

The command asks `Password: ` and shows nothing while you type. The password
needs at least 12 and at most 256 characters. On success it prints
`Account created (id <uuid>).`

In a script, pipe the password on stdin instead (never as an option: the
command refuses unknown options such as `--password`):

```sh
printf '%s' "$NEW_PASSWORD" | npm run user:create -w services/orders -- --email anna@example.com --name "Anna Rossi"
```

Other account commands:

| Task | Command | Result |
|---|---|---|
| Change a password | `npm run user:set-password -w services/orders -- --email anna@example.com` | asks the new password; ends the account's open sessions |
| Deactivate an account | `npm run user:deactivate -w services/orders -- --email anna@example.com` | the account can no longer log in; its sessions end |

Errors print `Error: ...` and exit with a non-zero code: `1` for a rule (email
already used, password too short, unknown email, database unreachable), `2`
for a wrong command line, `130` when you press Ctrl-C at the prompt.

## 7. Load demo orders (optional)

Orders reach the system only through the API (`POST /api/v1/orders`, with
`ORDER_API_KEY`); the web app cannot create them. For a development database,
the seed command adds demo orders:

```sh
npm run seed -w services/orders                # 40 orders
npm run seed -w services/orders -- --count 200 # from 1 to 9999
```

It prints how many orders it created, how many were already there and how many
got a status history. Running it again does not duplicate the orders it already
made. It refuses to run with `NODE_ENV=production`.

## Build, test and lint

| Task | Command |
|---|---|
| Build everything | `npm run build` |
| Unit and integration tests | `npm test` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Regenerate the web API types after a contract change | `npm run gen:api -w apps/web` |

The database tests of `services/orders` need Postgres running (step 5a.1) and
`DATABASE_URL` set.

## Upgrade to a newer version

```sh
git pull
npm ci
npm ci --prefix packages/money
npm run db:migrate -w services/orders
```

Then restart the dev servers, or rebuild the containers with
`docker compose up -d --build`. Migrations only move forward; read the new
ones in `services/orders/migrations/` before applying them to data you care
about.

## Back up and reset the local data

The data lives in the Docker volume `pgdata`. To copy it to a file:

```sh
docker compose exec postgres pg_dump -U orders orders > orders-backup.sql
```

The file holds customer names, emails and addresses and the staff password
hashes: keep it out of the repository and delete it when you no longer need it.

To start again from an empty database (this deletes every order and account):

```sh
docker compose down -v
docker compose up -d postgres
npm run db:migrate -w services/orders
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `npm ci`: 401 or 403 on `@albertoriorda95/money` | No registry login, or the token lacks `read:packages`: step 2. |
| `docker compose`: `set SESSION_SECRET in .env` or `set ORDER_API_KEY in .env` | The secret is empty in `.env`: step 4. |
| `ConfigError: DATABASE_URL is required` | No `.env` at the repository root, or `DATABASE_URL` empty in it. |
| `SESSION_SECRET must have at least 32 characters` (same for `ORDER_API_KEY`) | Generate it with `openssl rand -hex 32`. |
| The API logs `SESSION_SECRET is not set: using a random key, sessions end on restart` | Development mode without `SESSION_SECRET`: expected; set it to keep sessions across restarts. |
| `/health` answers 503 `unavailable` | Postgres is not running or not reachable at `DATABASE_URL`: `docker compose ps`. |
| The app shows "Can't reach the service." | The API is not running, or the web app was not opened on port 5173. |
| Login says "Too many attempts. Try again in N minutes." | 5 failed logins for that email within 15 minutes lock it for 15 minutes. Wait. |
| A port is already in use | Stop what uses 3000, 5173 or 5432. The ports are fixed in the configuration: the Vite proxy expects the API on 3000 (`apps/web/vite.config.ts`) and `PUBLIC_ORIGIN` expects the web app on 5173. |
| History entries signed "Seed data" | Status changes made by the seed command, through its own account `seed@example.test`, which cannot log in. |

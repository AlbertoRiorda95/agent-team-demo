# agent-team-demo

A test project for the [agent-team](https://github.com/AlbertoRiorda95/agent-team)
plugin: it is built from scratch by the agent team, to verify the plugin end to
end on GitHub and to measure the tokens each operation uses.

## Project brief

The input for `/agent-team:setup` and the design studio.

**Orders** is the back office of a small shop: staff see the orders, open one,
and change its status (new, paid, shipped, cancelled). Amounts are in several
currencies.

The repository is a monorepo:

- `packages/money`: a small shared library (amounts, currencies, rounding,
  formatting). It is released on its own with a `v*` tag to GitHub Packages,
  and the services use it as a normal dependency from the registry, never
  through a local path.
- `services/orders`: the backend, an HTTP API with a database, that uses
  `money`.
- `apps/web`: the frontend, the list and the detail of the orders.

Stack: TypeScript everywhere, npm, Node 24.

## Run it

With Node 24, Docker and a GitHub token with `read:packages`: log in to the
registry (`./ci/registry.sh login`), `npm ci`, `npm ci --prefix packages/money`,
copy `.env.example` to `.env` and fill its two secrets, `docker compose up -d postgres`,
`npm run db:migrate -w services/orders`, create an account with
`npm run user:create -w services/orders -- --email <e> --name <n>`, then
`npm run dev -w services/orders` and `npm run dev -w apps/web`, and open
http://localhost:5173. Every step, with the full-container variant:
[install and operate](docs/software/install-and-operate.md).

## Documentation

- [Install and operate](docs/software/install-and-operate.md): requirements,
  install, configuration, run, accounts, demo data, upgrade, back up,
  troubleshooting.
- [User manual](docs/software/user-manual.md): logging in, finding an order,
  checking it, changing its status.

Out of scope: payments, authentication beyond a single staff login, real
shipping.

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

Out of scope: payments, authentication beyond a single staff login, real
shipping.

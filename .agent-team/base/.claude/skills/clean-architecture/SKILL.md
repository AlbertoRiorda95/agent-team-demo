---
name: clean-architecture
description: How the backend is layered so that business rules do not depend on frameworks, databases or transports. Use it when you add or change a use case, an entity, a repository or an endpoint of a service that has real business rules.
---

# Clean architecture for the backend

<!-- CUSTOMIZE: the folder names to the project's stack (SETUP.md fills them in).
     Keep it short: backend preloads it on every start. Remove it, and its line in the
     backend agent's `skills:`, when the stack or the project does not fit (a script,
     a thin CRUD over a database, a framework that dictates its own structure). -->

## The rule

Dependencies point inward only. Code in an inner layer never imports an outer one.

| Layer (inner to outer) | Holds | May depend on |
|---|---|---|
| Domain | entities, value objects, business rules, domain errors | nothing |
| Application | use cases (one per user intention), the ports they need (repository, clock, mailer interfaces) | domain |
| Adapters | HTTP handlers, CLI, queue consumers; repository implementations, API clients | application, domain |
| Composition root | the one place that builds the objects and wires ports to adapters | everything |

Suggested folders under the backend's source root: `domain/`, `application/`,
`adapters/` (or `http/`, `persistence/`...), `main` for the wiring. Follow the
layout already in the repository if there is one.

## How to apply it

- A use case takes a plain input object, returns a plain output object or a
  domain error, and talks to the world only through ports. It knows nothing
  about HTTP status codes, SQL, the ORM, or request and queue-message types.
  One use case, one intention: split one that grows several.
- Ports name a capability ("save order", "send receipt"), not a technology,
  and are owned by the inner layer that needs them. Every side effect goes
  through one, the clock and the id generator included.
- Data crosses a boundary as plain objects, never as ORM rows, framework
  requests or SDK types. Infrastructure errors become application or domain
  errors in the adapter.
- The handler validates the input at the edge (the backend rule), calls one
  use case, and maps the result or error to the response. No business rule in it.
- A repository implementation maps between the database rows and the domain
  objects. ORM models and SQL never leave the adapter.
- The domain and the use cases are tested without a database or a server
  (in-memory fakes for the ports): fast tests through the seams of the spec's
  `## Test seams`. Adapters get integration tests against the real thing; if
  a port has several implementations, one shared contract test runs against
  each. Adapters never call each other: they go through a use case.
- Domain-driven design only when the domain is rich: value objects for
  concepts with rules (money, email), an aggregate with one root as the unit
  of consistency and of one transaction, domain events for what others react
  to. A plain entity is enough otherwise.
- Add a new port only when a use case needs something from outside. Do not
  create an interface for something with one implementation and no boundary.

## In existing code

Do not rewrite. Take the slice you are changing: write tests that pin its
current behavior, extract a use case with explicit input and output, put a
port around each infrastructure call, make the old handler delegate to the
use case. One slice per merge request.

## When not to

Do not impose layers on code that has no business rules to protect: a
migration, a one-off script, a pass-through endpoint. If a change is a few
lines in an existing handler, keep it there. A new use case is the moment to
apply the structure; do not restructure working code you were not asked to
touch (say in the MR that it could be, and let the user decide).

## Check before the merge request

- No import from an outer layer into an inner one (the domain imports no
  framework, no database driver, no HTTP library).
- Every use case is reachable from a test without starting the server.
- The wiring is in one place, not spread through the handlers: no global
  singletons or service locators.
- No business rule in a controller, no ORM object returned by a use case.

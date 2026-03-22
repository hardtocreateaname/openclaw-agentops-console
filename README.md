# OpenClaw AgentOps Console

Initial scaffold for a small Node/TypeScript web app that pairs an Express API with a Vite + React client.

## Development model

- **Development:** run the Express API and Vite client side by side. The Vite dev server proxies `/api` and `/events` requests to the Express server.
- **Production:** build the client with Vite, then have Express serve the generated static assets and API routes from one process.

## Planned scripts

- `npm run dev` — starts the server watcher and Vite client together.
- `npm run dev:server` — starts the Express server in watch mode.
- `npm run dev:client` — starts the Vite client.
- `npm run build` — type-checks and builds the client bundle.
- `npm run test` — runs server and client test commands.
- `npm run test:server` — runs server/shared Vitest suites.
- `npm run test:client` — runs client Vitest suites in JSDOM.

## Current scaffold status

This slice establishes the initial project contract layer:

- Shared TypeScript models live in `src/shared/types.ts`.
- Shared Zod schemas live in `src/shared/schemas.ts`.
- Contract coverage lives in `src/shared/schemas.test.ts`.
- Minimal server and client entrypoints are included so the requested scripts resolve to real files.

The shared schemas cover:

- connector-qualified IDs such as `sessions:abc123`
- agent units and capability declarations
- model policy and resolved policy payloads
- action results
- normalized runtime events

## Shared contract notes

- Connector IDs are lowercase slugs such as `sessions` or `runtime_local`.
- Connector-qualified IDs use the form `<connectorId>:<entityId>`.
- Timestamp fields are ISO-8601 strings validated with `z.string().datetime()`.
- Event payload metadata accepts JSON-compatible values so connector adapters can attach structured detail without introducing `any`.

## Next steps

- Add the first API routes that emit `NormalizedEvent` data from the shared schema layer.
- Add client views and tests that consume the shared contracts.
- Expand server and client test coverage once real features land.

# OpenClaw AgentOps Console

OpenClaw AgentOps Console pairs an Express API with a Vite + React client for agent, policy, and event inspection.

## Requirements

- Node.js 22+

## Development model

- **Development:** run the Express API and Vite client side by side. The Vite dev server proxies `/api` and `/events` requests to the Express server.
- **Build output:** `npm run build` type-checks the project and writes the client bundle to `dist/client`.

## Setup

```bash
npm install
```

## Available scripts

- `npm run dev` — starts the server watcher and Vite client together.
- `npm run dev:server` — starts the Express server in watch mode.
- `npm run dev:client` — starts the Vite client.
- `npm run build` — type-checks the project and builds the client bundle.
- `npm run test` — runs server and client test commands.
- `npm run test:server` — runs server/shared Vitest suites.
- `npm run test:client` — runs client Vitest suites in JSDOM.

## Verification

Run the current verification set with:

```bash
npm run test:server
npm run test:client
npm run build
```

## Current v1 foundation

- Shared TypeScript models live in `src/shared/types.ts`.
- Shared Zod schemas live in `src/shared/schemas.ts`.
- Express API routes live under `src/server/routes`.
- React pages live under `src/client/pages`.
- Vitest coverage exists for shared contracts, server services/routes, and the current client pages.

## Shared contract notes

- Connector IDs are lowercase slugs such as `sessions` or `runtime_local`.
- Connector-qualified IDs use the form `<connectorId>:<entityId>`.
- Timestamp fields are ISO-8601 strings validated with `z.string().datetime()`.
- Event payload metadata accepts JSON-compatible values so connector adapters can attach structured detail without introducing `any`.

The current UI covers overview, agents, agent detail, and policies flows backed by the shared contract layer.

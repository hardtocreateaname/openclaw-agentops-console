import { Router } from 'express'

import type { NormalizedEvent } from '../../shared/types'

export function createEventsRouter(input: {
  listEvents: () => NormalizedEvent[]
}): Router {
  const router = Router()

  router.get('/', (request, response) => {
    const limitParam = request.query.limit
    const limit =
      typeof limitParam === 'string' && Number.isFinite(Number(limitParam))
        ? Math.max(Number(limitParam), 0)
        : null
    const events = input.listEvents()

    response.json({
      data: limit === null ? events : events.slice(0, limit),
    })
  })

  return router
}

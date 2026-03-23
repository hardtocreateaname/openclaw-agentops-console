import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { ActionStatus, EventKind, type NormalizedEvent } from '../../shared/types'
import { createEventsRouter } from './events'

describe('events routes', () => {
  it('classifies important, normal, and noisy events for the operator feed', async () => {
    const app = express()
    app.use(
      '/api/events',
      createEventsRouter({
        listEvents: () => [
          createEvent('event-important', EventKind.SessionUpdated, {
            turnOp: 'user_turn',
          }),
          createEvent('event-noisy', EventKind.SessionUpdated, {
            turnOp: 'list_skills',
          }),
          createEvent('event-normal', EventKind.SessionStarted, {}),
        ],
      }),
    )

    const response = await request(app).get('/api/events').expect(200)

    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'event-important',
        payload: expect.objectContaining({
          presentationPriority: 'important',
          presentationSummary: 'User turn received for sessions:thread-001.',
        }),
      }),
      expect.objectContaining({
        id: 'event-noisy',
        payload: expect.objectContaining({
          presentationPriority: 'noisy',
          presentationSummary: 'Internal runtime step list skills.',
        }),
      }),
      expect.objectContaining({
        id: 'event-normal',
        payload: expect.objectContaining({
          presentationPriority: 'normal',
          presentationSummary: 'sessions:thread-001 session started.',
        }),
      }),
    ])
  })

  it('keeps action and fallback-related events important', async () => {
    const app = express()
    app.use(
      '/api/events',
      createEventsRouter({
        listEvents: () => [
          createEvent('event-action', EventKind.ActionCompleted, {
            action: 'interrupt',
            status: ActionStatus.Failed,
          }),
          createEvent('event-fallback', EventKind.AgentUpdated, {
            reason: 'fallback_active',
          }),
        ],
      }),
    )

    const response = await request(app).get('/api/events').expect(200)

    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'event-action',
        payload: expect.objectContaining({
          presentationPriority: 'important',
          presentationSummary: 'Operator action interrupt finished with status failed.',
        }),
      }),
      expect.objectContaining({
        id: 'event-fallback',
        payload: expect.objectContaining({
          presentationPriority: 'important',
          presentationSummary: 'sessions:thread-001 emitted an operator-relevant runtime event.',
        }),
      }),
    ])
  })
})

function createEvent(
  id: string,
  kind: NormalizedEvent['kind'],
  payload: NormalizedEvent['payload'],
): NormalizedEvent {
  return {
    id,
    kind,
    connectorId: 'sessions',
    subjectId: 'sessions:thread-001',
    sessionId: 'sessions:thread-001',
    agentId: null,
    occurredAt: '2026-03-22T12:00:00.000Z',
    payload,
  }
}

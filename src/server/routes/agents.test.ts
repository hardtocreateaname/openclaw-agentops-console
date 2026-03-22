import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { ActionKind, ActionStatus, AgentStatus, EventKind } from '../../shared/types'
import { createApp } from '../app'
import { DEFAULT_POLICY_LAYERS } from '../config'
import { MemoryPolicyStore } from '../store/policy-store'

describe('agents routes', () => {
  it('lists agents with normalized shape and health metadata', async () => {
    const app = await createApp({
      now: () => '2026-03-22T00:00:00.000Z',
      policyStore: new MemoryPolicyStore(DEFAULT_POLICY_LAYERS),
    })

    const response = await request(app).get('/api/agents').expect(200)

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: expect.objectContaining({
            id: 'subagents:subagent-001',
            status: AgentStatus.Running,
          }),
          unitType: 'subagent',
          health: expect.objectContaining({
            status: 'healthy',
          }),
        }),
        expect.objectContaining({
          agent: expect.objectContaining({
            id: 'subagents:subagent-002',
            status: AgentStatus.Blocked,
          }),
          health: expect.objectContaining({
            status: 'anomaly',
          }),
        }),
      ]),
    )
  })

  it('returns a detail view for a specific agent', async () => {
    const app = await createApp({
      now: () => '2026-03-22T00:00:00.000Z',
      policyStore: new MemoryPolicyStore(DEFAULT_POLICY_LAYERS),
    })

    const response = await request(app).get('/api/agents/subagents:subagent-001').expect(200)

    expect(response.body.data).toEqual(
      expect.objectContaining({
        agent: expect.objectContaining({
          id: 'subagents:subagent-001',
          sessionId: 'sessions:sess-001',
          name: 'planner',
        }),
        lastProgressAt: '2026-03-21T23:59:50.000Z',
      }),
    )
  })

  it('accepts a control action for controllable agents and emits action events', async () => {
    const app = await createApp({
      now: () => '2026-03-22T00:00:00.000Z',
      policyStore: new MemoryPolicyStore(DEFAULT_POLICY_LAYERS),
    })

    const actionResponse = await request(app)
      .post('/api/agents/subagents:subagent-001/actions')
      .send({
        action: ActionKind.Interrupt,
      })
      .expect(202)

    expect(actionResponse.body.data).toEqual(
      expect.objectContaining({
        action: ActionKind.Interrupt,
        status: ActionStatus.Completed,
        targetId: 'subagents:subagent-001',
      }),
    )

    const eventsResponse = await request(app).get('/api/events?limit=2').expect(200)

    expect(eventsResponse.body.data).toHaveLength(2)
    expect(eventsResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: EventKind.ActionRequested,
          subjectId: 'subagents:subagent-001',
        }),
        expect.objectContaining({
          kind: EventKind.ActionCompleted,
          subjectId: 'subagents:subagent-001',
        }),
      ]),
    )
  })

  it('rejects a control action for read-only agents', async () => {
    const app = await createApp({
      now: () => '2026-03-22T00:00:00.000Z',
      policyStore: new MemoryPolicyStore(DEFAULT_POLICY_LAYERS),
    })

    const response = await request(app)
      .post('/api/agents/subagents:subagent-002/actions')
      .send({
        action: ActionKind.Resume,
      })
      .expect(409)

    expect(response.body.data).toEqual(
      expect.objectContaining({
        action: ActionKind.Resume,
        status: ActionStatus.Rejected,
        error: 'subagents:subagent-002 does not support control actions',
      }),
    )
  })
})

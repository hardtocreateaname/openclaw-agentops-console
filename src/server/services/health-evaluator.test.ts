import { describe, expect, it } from 'vitest'

import { toConnectorQualifiedId, type ConnectorUnitSnapshot } from '../connectors/types'
import { evaluateHealth } from './health-evaluator'

const BASE_UNIT: ConnectorUnitSnapshot = {
  id: toConnectorQualifiedId('subagents', 'subagent-001'),
  connectorId: 'subagents',
  unitType: 'subagent',
  name: 'planner',
  lifecycle: 'running',
  lastSeenAt: '2026-03-22T00:00:00.000Z',
  lastProgressAt: '2026-03-21T23:59:30.000Z',
  latencyMs: 100,
  fallbackActive: false,
  controllable: true,
  metadata: {},
}

describe('evaluateHealth', () => {
  it('flags stuck units as anomalies', () => {
    const evaluation = evaluateHealth({
      unit: {
        ...BASE_UNIT,
        lastProgressAt: '2026-03-21T23:30:00.000Z',
      },
      now: '2026-03-22T00:00:00.000Z',
      thresholds: {
        stuckAfterMs: 10 * 60 * 1000,
        highLatencyMs: 1000,
      },
    })

    expect(evaluation.status).toBe('anomaly')
    expect(evaluation.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'stuck',
          anomalous: true,
        }),
      ]),
    )
  })

  it('flags high latency and fallback mode as anomalies', () => {
    const evaluation = evaluateHealth({
      unit: {
        ...BASE_UNIT,
        latencyMs: 2500,
        fallbackActive: true,
      },
      now: '2026-03-22T00:00:00.000Z',
      thresholds: {
        stuckAfterMs: 60 * 60 * 1000,
        highLatencyMs: 1500,
      },
    })

    expect(evaluation.status).toBe('anomaly')
    expect(evaluation.signals.map((signal) => signal.kind)).toEqual([
      'high_latency',
      'fallback_active',
    ])
  })

  it('treats uncontrollable units as informational by default', () => {
    const evaluation = evaluateHealth({
      unit: {
        ...BASE_UNIT,
        controllable: false,
        lifecycle: 'idle',
      },
      now: '2026-03-22T00:00:00.000Z',
      thresholds: {
        stuckAfterMs: 10 * 60 * 1000,
        highLatencyMs: 1000,
      },
    })

    expect(evaluation.status).toBe('informational')
    expect(evaluation.signals).toEqual([
      expect.objectContaining({
        kind: 'uncontrollable',
        anomalous: false,
        severity: 'info',
      }),
    ])
  })
})

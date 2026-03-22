import { describe, expect, it } from 'vitest'

import { createOpenClawSessionsConnector } from '../connectors/openclaw-sessions'
import { createOpenClawSessionsFixtureConnector } from '../connectors/fixture/openclaw-sessions-fixture'
import { toConnectorQualifiedId, type ConnectorUnitSnapshot } from '../connectors/types'
import { Registry } from './registry'

describe('Registry', () => {
  it('stores fixture connectors and units under canonical IDs', async () => {
    const registry = new Registry()
    const connector = createOpenClawSessionsFixtureConnector()
    registry.registerConnector(connector)

    const inserted = registry.upsertUnits(await connector.listUnits())

    expect(registry.getConnector('sessions')).toBe(connector)
    expect(inserted[0]?.id).toBe('sessions:sess-001')
    expect(registry.getUnit('sess-001', 'sessions')?.id).toBe('sessions:sess-001')
  })

  it('canonicalizes IDs emitted by the real sessions connector boundary', async () => {
    const registry = new Registry()
    const connector = createOpenClawSessionsConnector({
      sourcesConfig: {
        historyPath: '/does/not/exist/history.jsonl',
        tuiLogPath: '/does/not/exist/codex-tui.log',
        versionPath: '/does/not/exist/version.json',
      },
    })
    registry.registerConnector(connector)

    const inserted = registry.upsertUnits(await connector.listUnits())

    expect(inserted[0]?.id).toMatch(/^sessions:/)
    expect(inserted.every((unit) => unit.id.startsWith('sessions:'))).toBe(true)
  })

  it('dedupes repeated canonical IDs by keeping the last snapshot', () => {
    const registry = new Registry()
    const duplicateId = toConnectorQualifiedId('subagents', 'subagent-001')

    const inserted = registry.upsertUnits([
      createUnit({
        id: duplicateId,
        name: 'planner-v1',
        latencyMs: 100,
      }),
      createUnit({
        id: duplicateId,
        name: 'planner-v2',
        latencyMs: 250,
      }),
    ])

    expect(inserted).toHaveLength(1)
    expect(registry.listUnits()).toHaveLength(1)
    expect(registry.getUnit(duplicateId)?.name).toBe('planner-v2')
    expect(registry.getUnit(duplicateId)?.latencyMs).toBe(250)
  })

  it('does not dedupe snapshots from different connectors that share the same entity suffix', () => {
    const registry = new Registry()

    registry.upsertUnits([
      createUnit({
        id: 'sessions:shared-001',
        connectorId: 'sessions',
        unitType: 'session',
      }),
      createUnit({
        id: 'subagents:shared-001',
        connectorId: 'subagents',
      }),
    ])

    expect(registry.getUnit('sessions:shared-001')).toBeDefined()
    expect(registry.getUnit('subagents:shared-001')).toBeDefined()
    expect(registry.listUnits()).toHaveLength(2)
  })

  it('rejects connector-qualified IDs that do not match the stated connector', () => {
    const registry = new Registry()

    expect(() =>
      registry.upsertUnits([
        createUnit({
          id: 'sessions:sess-001',
          connectorId: 'subagents',
        }),
      ]),
    ).toThrow(/does not belong to connector/)
  })
})

function createUnit(overrides: Partial<ConnectorUnitSnapshot>): ConnectorUnitSnapshot {
  return {
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
    ...overrides,
  }
}

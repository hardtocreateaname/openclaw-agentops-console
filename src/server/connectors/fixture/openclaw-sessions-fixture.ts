import {
  toConnectorQualifiedId,
  type ConnectorAdapter,
  type ConnectorUnitSnapshot,
} from '../types'

const CONNECTOR_ID = 'sessions'
const FIXTURE_TIMESTAMP = '2026-03-22T00:00:00.000Z'

export function createOpenClawSessionsFixtureConnector(): ConnectorAdapter {
  return {
    id: CONNECTOR_ID,
    displayName: 'OpenClaw Sessions Fixture',
    isFixture: true,
    listUnits() {
      const units: ConnectorUnitSnapshot[] = [
        {
          id: toConnectorQualifiedId(CONNECTOR_ID, 'sess-001'),
          connectorId: CONNECTOR_ID,
          unitType: 'session',
          name: 'incident-triage',
          lifecycle: 'running',
          lastSeenAt: FIXTURE_TIMESTAMP,
          lastProgressAt: FIXTURE_TIMESTAMP,
          latencyMs: 120,
          fallbackActive: false,
          controllable: true,
          metadata: {
            owner: 'ops',
            priority: 'p1',
          },
        },
        {
          id: toConnectorQualifiedId(CONNECTOR_ID, 'sess-002'),
          connectorId: CONNECTOR_ID,
          unitType: 'session',
          name: 'retrospective-export',
          lifecycle: 'waiting',
          lastSeenAt: FIXTURE_TIMESTAMP,
          lastProgressAt: '2026-03-21T23:58:00.000Z',
          latencyMs: 80,
          fallbackActive: false,
          controllable: true,
          metadata: {
            owner: 'reporting',
            queued: true,
          },
        },
      ]

      return units
    },
  }
}

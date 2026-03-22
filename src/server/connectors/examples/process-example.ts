import { createMemoryEventEmitter, toConnectorQualifiedId, type ConnectorAdapter } from '../types'

const EXAMPLE_CONNECTOR_ID = 'process_example'

export function createProcessExampleConnector(): ConnectorAdapter {
  const events = createMemoryEventEmitter()

  return {
    id: EXAMPLE_CONNECTOR_ID,
    displayName: 'Process Example Connector',
    async listUnits() {
      return [
        {
          id: toConnectorQualifiedId(EXAMPLE_CONNECTOR_ID, 'worker-001'),
          connectorId: EXAMPLE_CONNECTOR_ID,
          unitType: 'process',
          name: 'example-worker',
          lifecycle: 'running',
          lastSeenAt: '2026-03-22T00:00:00.000Z',
          lastProgressAt: '2026-03-22T00:00:00.000Z',
          latencyMs: 25,
          fallbackActive: false,
          controllable: true,
          metadata: {
            pid: 4242,
          },
        },
      ]
    },
    subscribe(listener) {
      return events.subscribe(listener)
    },
  }
}

import type { ConnectorQualifiedId, JsonValue, NormalizedEvent } from '../../shared/types'

const CONNECTOR_ID_PATTERN = /^[a-z][a-z0-9_-]*$/
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const CONNECTOR_QUALIFIED_ID_PATTERN = /^([a-z][a-z0-9_-]*):([A-Za-z0-9][A-Za-z0-9._:-]*)$/

export type ConnectorUnitLifecycle = 'idle' | 'running' | 'waiting' | 'completed' | 'failed'

export interface ConnectorUnitSnapshot {
  id: ConnectorQualifiedId
  connectorId: string
  unitType: string
  name: string
  lifecycle: ConnectorUnitLifecycle
  lastSeenAt: string
  lastProgressAt: string | null
  latencyMs: number | null
  fallbackActive: boolean
  controllable: boolean
  metadata: Record<string, JsonValue>
}

export interface ConnectorEventSubscription {
  unsubscribe(): void
}

export interface ConnectorEventEmitter {
  subscribe?(listener: (event: NormalizedEvent) => void): ConnectorEventSubscription
}

export interface ConnectorAdapter extends ConnectorEventEmitter {
  id: string
  displayName: string
  isFixture?: boolean
  listUnits(): Promise<ConnectorUnitSnapshot[]> | ConnectorUnitSnapshot[]
}

export function isConnectorId(value: string): boolean {
  return CONNECTOR_ID_PATTERN.test(value)
}

export function isConnectorQualifiedId(value: string): value is ConnectorQualifiedId {
  return CONNECTOR_QUALIFIED_ID_PATTERN.test(value)
}

export function parseConnectorQualifiedId(
  value: string,
): { connectorId: string; entityId: string } | null {
  const match = CONNECTOR_QUALIFIED_ID_PATTERN.exec(value)

  if (!match) {
    return null
  }

  return {
    connectorId: match[1],
    entityId: match[2],
  }
}

export function toConnectorQualifiedId(
  connectorId: string,
  entityId: string,
): ConnectorQualifiedId {
  if (!isConnectorId(connectorId)) {
    throw new Error(`Invalid connector ID: ${connectorId}`)
  }

  if (!ENTITY_ID_PATTERN.test(entityId)) {
    throw new Error(`Invalid connector entity ID: ${entityId}`)
  }

  return `${connectorId}:${entityId}`
}

export function canonicalizeConnectorQualifiedId(
  connectorId: string,
  value: string,
): ConnectorQualifiedId {
  if (!isConnectorId(connectorId)) {
    throw new Error(`Invalid connector ID: ${connectorId}`)
  }

  const parsed = parseConnectorQualifiedId(value)

  if (parsed) {
    if (parsed.connectorId !== connectorId) {
      throw new Error(
        `Connector-qualified ID ${value} does not belong to connector ${connectorId}`,
      )
    }

    return value
  }

  return toConnectorQualifiedId(connectorId, value)
}

export function createMemoryEventEmitter(): {
  emit(event: NormalizedEvent): void
  subscribe(listener: (event: NormalizedEvent) => void): ConnectorEventSubscription
} {
  const listeners = new Set<(event: NormalizedEvent) => void>()

  return {
    emit(event) {
      for (const listener of listeners) {
        listener(event)
      }
    },
    subscribe(listener) {
      listeners.add(listener)

      return {
        unsubscribe() {
          listeners.delete(listener)
        },
      }
    },
  }
}

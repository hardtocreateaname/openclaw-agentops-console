import type { ConnectorQualifiedId } from '../../shared/types'

import {
  canonicalizeConnectorQualifiedId,
  type ConnectorAdapter,
  type ConnectorUnitSnapshot,
} from '../connectors/types'

export interface RegistryRecord extends ConnectorUnitSnapshot {
  id: ConnectorQualifiedId
}

export class Registry {
  readonly #connectors = new Map<string, ConnectorAdapter>()
  readonly #units = new Map<ConnectorQualifiedId, RegistryRecord>()

  registerConnector(connector: ConnectorAdapter): void {
    this.#connectors.set(connector.id, connector)
  }

  getConnector(connectorId: string): ConnectorAdapter | undefined {
    return this.#connectors.get(connectorId)
  }

  upsertUnits(units: ConnectorUnitSnapshot[]): RegistryRecord[] {
    const deduped = new Map<ConnectorQualifiedId, RegistryRecord>()

    for (const unit of units) {
      const canonicalId = canonicalizeConnectorQualifiedId(unit.connectorId, unit.id)
      deduped.set(canonicalId, {
        ...unit,
        id: canonicalId,
      })
    }

    for (const [canonicalId, unit] of deduped) {
      this.#units.set(canonicalId, unit)
    }

    return [...deduped.values()]
  }

  getUnit(unitId: string, connectorId?: string): RegistryRecord | undefined {
    const canonicalId = connectorId
      ? canonicalizeConnectorQualifiedId(connectorId, unitId)
      : unitId

    return this.#units.get(canonicalId as ConnectorQualifiedId)
  }

  listUnits(): RegistryRecord[] {
    return [...this.#units.values()]
  }
}

import type { ConnectorUnitSnapshot } from '../connectors/types'

export type HealthSeverity = 'info' | 'warning'
export type HealthSignalKind = 'stuck' | 'high_latency' | 'fallback_active' | 'uncontrollable'
export type HealthStatus = 'healthy' | 'informational' | 'anomaly'

export interface HealthSignal {
  kind: HealthSignalKind
  severity: HealthSeverity
  anomalous: boolean
  message: string
}

export interface HealthEvaluation {
  status: HealthStatus
  signals: HealthSignal[]
}

export interface HealthEvaluatorThresholds {
  stuckAfterMs: number
  highLatencyMs: number
}

export interface EvaluateHealthInput {
  unit: ConnectorUnitSnapshot
  now: string
  thresholds: HealthEvaluatorThresholds
}

const ACTIVE_LIFECYCLES = new Set<ConnectorUnitSnapshot['lifecycle']>(['running', 'waiting'])

export function evaluateHealth(input: EvaluateHealthInput): HealthEvaluation {
  const signals: HealthSignal[] = []
  const nowMs = Date.parse(input.now)
  const lastProgressMs = input.unit.lastProgressAt ? Date.parse(input.unit.lastProgressAt) : null

  if (
    lastProgressMs !== null &&
    ACTIVE_LIFECYCLES.has(input.unit.lifecycle) &&
    nowMs - lastProgressMs >= input.thresholds.stuckAfterMs
  ) {
    signals.push({
      kind: 'stuck',
      severity: 'warning',
      anomalous: true,
      message: `${input.unit.id} has not progressed within the configured stuck window`,
    })
  }

  if (
    input.unit.latencyMs !== null &&
    input.unit.latencyMs >= input.thresholds.highLatencyMs
  ) {
    signals.push({
      kind: 'high_latency',
      severity: 'warning',
      anomalous: true,
      message: `${input.unit.id} is above the configured latency threshold`,
    })
  }

  if (input.unit.fallbackActive) {
    signals.push({
      kind: 'fallback_active',
      severity: 'warning',
      anomalous: true,
      message: `${input.unit.id} is operating in fallback mode`,
    })
  }

  if (!input.unit.controllable) {
    signals.push({
      kind: 'uncontrollable',
      severity: 'info',
      anomalous: false,
      message: `${input.unit.id} is read-only from the console`,
    })
  }

  return {
    status: deriveStatus(signals),
    signals,
  }
}

function deriveStatus(signals: HealthSignal[]): HealthStatus {
  if (signals.some((signal) => signal.anomalous)) {
    return 'anomaly'
  }

  if (signals.length > 0) {
    return 'informational'
  }

  return 'healthy'
}

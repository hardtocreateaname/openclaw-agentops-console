import { PolicyScope, PolicySource, type JsonValue, type ModelPolicy, type ResolvedPolicy } from '../../shared/types'

export interface PolicyFieldAttribution {
  policyId: string
  scope: 'global' | 'type' | 'unit'
  source: PolicySource
}

export interface PolicyResolutionResult {
  subject: {
    id: string
    unitType: string
  }
  resolvedPolicy: ResolvedPolicy
  explanation: {
    appliedPolicies: PolicyFieldAttribution[]
    attribution: {
      model: Partial<Record<keyof ModelPolicy, PolicyFieldAttribution>>
      overrides: Record<string, PolicyFieldAttribution>
      appliesToMetadata: Record<string, PolicyFieldAttribution>
    }
    appliesTo: {
      metadata: Record<string, JsonValue>
    }
  }
}

export function PolicyResolutionCard(props: { resolution: PolicyResolutionResult }) {
  const { resolution } = props
  const applicationScope = describeApplicationScope(resolution)
  const modelAttribution = Object.entries(resolution.explanation.attribution.model)
  const overrideAttribution = Object.entries(resolution.explanation.attribution.overrides)

  return (
    <section className="panel" aria-label="Policy resolution preview">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Resolution preview</p>
          <h2>Effective policy for {resolution.subject.id}</h2>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <article className="risk-card">
          <h3 style={{ margin: 0 }}>Winning layer</h3>
          <p className="cell-subtitle" style={{ marginBottom: '12px' }}>
            Final source attribution for the current target.
          </p>
          <dl className="risk-card__facts" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <dt>Source</dt>
              <dd>{labelPolicySource(resolution.resolvedPolicy.source)}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{labelResolvedScope(resolution.resolvedPolicy.scope)}</dd>
            </div>
            <div>
              <dt>Application scope</dt>
              <dd>{applicationScope}</dd>
            </div>
          </dl>
        </article>

        <article className="risk-card">
          <h3 style={{ margin: 0 }}>Resolved model</h3>
          <p className="cell-subtitle" style={{ marginBottom: '12px' }}>
            Final model policy fields after layering.
          </p>
          <dl className="risk-card__facts" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <dt>Provider / model</dt>
              <dd>
                {resolution.resolvedPolicy.model.provider} / {resolution.resolvedPolicy.model.model}
              </dd>
            </div>
            <div>
              <dt>Tool choice</dt>
              <dd>{resolution.resolvedPolicy.model.toolChoice}</dd>
            </div>
            <div>
              <dt>System prompt</dt>
              <dd>{resolution.resolvedPolicy.model.systemPrompt ?? 'None'}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          marginTop: '16px',
        }}
      >
        <article className="risk-card">
          <h3 style={{ margin: 0 }}>Applied layers</h3>
          <ul className="event-feed" style={{ marginTop: '12px' }}>
            {resolution.explanation.appliedPolicies.map((policy) => (
              <li className="event-card" key={policy.policyId}>
                <div className="event-card__header">
                  <span className="event-card__title">{policy.policyId}</span>
                  <span className="event-kind event-kind--info">{labelScope(policy.scope)}</span>
                </div>
                <p className="event-card__detail">{labelPolicySource(policy.source)}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="risk-card">
          <h3 style={{ margin: 0 }}>Source attribution</h3>
          <ul className="event-feed" style={{ marginTop: '12px' }}>
            {modelAttribution.map(([field, attribution]) => (
              <li className="event-card" key={`model:${field}`}>
                <div className="event-card__header">
                  <span className="event-card__title">{field}</span>
                  <span className="event-kind event-kind--success">{attribution?.policyId}</span>
                </div>
                <p className="event-card__detail">
                  {attribution ? `${labelScope(attribution.scope)} from ${labelPolicySource(attribution.source)}` : 'Defaulted'}
                </p>
              </li>
            ))}
            {overrideAttribution.map(([field, attribution]) => (
              <li className="event-card" key={`override:${field}`}>
                <div className="event-card__header">
                  <span className="event-card__title">override:{field}</span>
                  <span className="event-kind event-kind--warning">{attribution.policyId}</span>
                </div>
                <p className="event-card__detail">
                  {labelScope(attribution.scope)} from {labelPolicySource(attribution.source)}
                </p>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}

function describeApplicationScope(resolution: PolicyResolutionResult): string {
  const metadataEntries = Object.entries(resolution.explanation.appliesTo.metadata)

  if (metadataEntries.length === 0) {
    return `Applies to ${resolution.subject.unitType} units without extra metadata qualifiers`
  }

  return metadataEntries.map(([key, value]) => `${key}=${formatJsonValue(value)}`).join(', ')
}

function formatJsonValue(value: JsonValue): string {
  if (Array.isArray(value)) {
    return value.map(formatJsonValue).join(', ')
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function labelScope(scope: PolicyFieldAttribution['scope']): string {
  if (scope === 'type') {
    return 'Type'
  }

  if (scope === 'unit') {
    return 'Unit'
  }

  return 'Global'
}

function labelResolvedScope(scope: PolicyScope): string {
  if (scope === PolicyScope.Agent) {
    return 'Unit override'
  }

  if (scope === PolicyScope.Connector) {
    return 'Type default'
  }

  return 'Global baseline'
}

function labelPolicySource(source: PolicySource): string {
  switch (source) {
    case PolicySource.Connector:
      return 'Connector'
    case PolicySource.Operator:
      return 'Operator'
    case PolicySource.Runtime:
      return 'Runtime'
    case PolicySource.Default:
    default:
      return 'Default'
  }
}

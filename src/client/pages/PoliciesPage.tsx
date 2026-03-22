import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react'

import { PolicySource, type JsonValue, type ModelPolicy } from '../../shared/types'
import { listAgents } from '../api'
import { PolicyResolutionCard, type PolicyResolutionResult } from '../components/PolicyResolutionCard'

type PolicyScope = 'global' | 'type' | 'unit'

interface PolicyLayer {
  id: string
  scope: PolicyScope
  source: PolicySource
  targetType?: string
  targetId?: string
  model?: Partial<ModelPolicy>
  overrides?: Record<string, JsonValue>
  appliesTo?: {
    metadata?: Record<string, JsonValue>
  }
}

interface PolicyEditorDraft {
  modelName: string
  systemPrompt: string
  overrides: string
  appliesToMetadata: string
}

export function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyLayer[]>([])
  const [drafts, setDrafts] = useState<Record<string, PolicyEditorDraft>>({})
  const [targets, setTargets] = useState<Array<{ id: string; label: string }>>([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [resolution, setResolution] = useState<PolicyResolutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [loadedPolicies, agents] = await Promise.all([listPolicies(), listAgents()])

        if (cancelled) {
          return
        }

        setPolicies(loadedPolicies)
        setDrafts(createDrafts(loadedPolicies))

        const nextTargets = agents.map((agent) => ({
          id: agent.agent.id,
          label: `${agent.agent.name} (${agent.unitType})`,
        }))

        setTargets(nextTargets)
        setSelectedTarget(nextTargets[0]?.id ?? '')
        setError(null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load policies')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadResolution() {
      if (!selectedTarget) {
        return
      }

      try {
        const nextResolution = await resolvePolicy(selectedTarget)

        if (!cancelled) {
          setResolution(nextResolution)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to resolve policy')
        }
      }
    }

    void loadResolution()

    return () => {
      cancelled = true
    }
  }, [selectedTarget])

  const scopedPolicies = useMemo(
    () => ({
      global: policies.find((policy) => policy.scope === 'global') ?? null,
      type: policies.find((policy) => policy.scope === 'type') ?? null,
      unit: policies.find((policy) => policy.scope === 'unit') ?? null,
    }),
    [policies],
  )

  if (error) {
    return <section className="panel error-panel">Policies failed to load: {error}</section>
  }

  if (policies.length === 0) {
    return <section className="panel loading-panel">Loading policies...</section>
  }

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Policies</p>
          <h1>Layered runtime controls</h1>
          <p className="hero-copy">
            Inspect baseline, type, and unit overrides before changing how the console resolves runtime behavior.
          </p>
        </div>
        <div className="hero-summary">
          <span className="hero-summary__label">Loaded layers</span>
          <strong>{policies.length}</strong>
          <span className="hero-summary__meta">Global, type, and unit scopes are available</span>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: '20px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        <PolicyEditorPanel
          description="Baseline defaults that apply across the console."
          drafts={drafts}
          label="Global policy"
          policy={scopedPolicies.global}
          onDraftChange={setDrafts}
        />
        <PolicyEditorPanel
          description="Type-level shaping for one runtime family."
          drafts={drafts}
          label="Type policy"
          policy={scopedPolicies.type}
          onDraftChange={setDrafts}
        />
        <PolicyEditorPanel
          description="Unit-level override for a single target."
          drafts={drafts}
          label="Unit policy"
          policy={scopedPolicies.unit}
          onDraftChange={setDrafts}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Preview target</p>
            <h2>Resolve current policy</h2>
          </div>
        </div>
        <label className="field" style={{ maxWidth: '360px' }}>
          <span>Application scope target</span>
          <select
            aria-label="Application scope target"
            value={selectedTarget}
            onChange={(event) => setSelectedTarget(event.target.value)}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {resolution ? <PolicyResolutionCard resolution={resolution} /> : null}
    </div>
  )
}

function PolicyEditorPanel(props: {
  label: string
  description: string
  policy: PolicyLayer | null
  drafts: Record<string, PolicyEditorDraft>
  onDraftChange: Dispatch<SetStateAction<Record<string, PolicyEditorDraft>>>
}) {
  if (!props.policy) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{props.label}</p>
            <h2>Not configured</h2>
          </div>
        </div>
      </section>
    )
  }

  const draft = props.drafts[props.policy.id]

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{props.label}</p>
          <h2>{props.policy.id}</h2>
          <p className="cell-subtitle">{props.description}</p>
        </div>
        <span className="event-kind event-kind--info">{props.policy.source}</span>
      </div>

      <div style={{ display: 'grid', gap: '14px' }}>
        <label className="field">
          <span>{props.label} model</span>
          <input
            aria-label={`${props.label} model`}
            type="text"
            value={draft?.modelName ?? ''}
            onChange={(event) =>
              props.onDraftChange((current) => ({
                ...current,
                [props.policy!.id]: {
                  ...(current[props.policy!.id] ?? createDraft(props.policy!)),
                  modelName: event.target.value,
                },
              }))
            }
          />
        </label>

        <label className="field">
          <span>{props.label} system prompt</span>
          <textarea
            aria-label={`${props.label} system prompt`}
            rows={4}
            value={draft?.systemPrompt ?? ''}
            onChange={(event) =>
              props.onDraftChange((current) => ({
                ...current,
                [props.policy!.id]: {
                  ...(current[props.policy!.id] ?? createDraft(props.policy!)),
                  systemPrompt: event.target.value,
                },
              }))
            }
          />
        </label>

        <label className="field">
          <span>{props.label} overrides</span>
          <textarea
            aria-label={`${props.label} overrides`}
            rows={4}
            value={draft?.overrides ?? ''}
            onChange={(event) =>
              props.onDraftChange((current) => ({
                ...current,
                [props.policy!.id]: {
                  ...(current[props.policy!.id] ?? createDraft(props.policy!)),
                  overrides: event.target.value,
                },
              }))
            }
          />
        </label>

        <label className="field">
          <span>{props.label} applies-to metadata</span>
          <textarea
            aria-label={`${props.label} applies-to metadata`}
            rows={3}
            value={draft?.appliesToMetadata ?? ''}
            onChange={(event) =>
              props.onDraftChange((current) => ({
                ...current,
                [props.policy!.id]: {
                  ...(current[props.policy!.id] ?? createDraft(props.policy!)),
                  appliesToMetadata: event.target.value,
                },
              }))
            }
          />
        </label>
      </div>
    </section>
  )
}

async function listPolicies(): Promise<PolicyLayer[]> {
  const response = await fetch('/api/policies', {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed for /api/policies: ${response.status}`)
  }

  const data = (await response.json()) as { data: PolicyLayer[] }
  return data.data
}

async function resolvePolicy(targetId: string): Promise<PolicyResolutionResult> {
  const response = await fetch('/api/policies/resolve', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetId }),
  })

  if (!response.ok) {
    throw new Error(`Request failed for /api/policies/resolve: ${response.status}`)
  }

  const data = (await response.json()) as { data: PolicyResolutionResult }
  return data.data
}

function createDrafts(policies: PolicyLayer[]): Record<string, PolicyEditorDraft> {
  return Object.fromEntries(policies.map((policy) => [policy.id, createDraft(policy)]))
}

function createDraft(policy: PolicyLayer): PolicyEditorDraft {
  return {
    modelName: policy.model?.model ?? '',
    systemPrompt: policy.model?.systemPrompt ?? '',
    overrides: JSON.stringify(policy.overrides ?? {}, null, 2),
    appliesToMetadata: JSON.stringify(policy.appliesTo?.metadata ?? {}, null, 2),
  }
}

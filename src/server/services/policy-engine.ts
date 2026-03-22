import type {
  ConnectorCapability,
  JsonValue,
  ModelPolicy,
  PolicySource,
  ToolChoiceMode,
} from '../../shared/types'

export type PolicyLayerScope = 'global' | 'type' | 'unit'

export interface PolicyAppliesTo {
  metadata?: Record<string, JsonValue>
}

export interface PolicyLayer {
  id: string
  scope: PolicyLayerScope
  source: PolicySource
  targetType?: string
  targetId?: string
  model?: Partial<ModelPolicy>
  overrides?: Record<string, JsonValue>
  appliesTo?: PolicyAppliesTo
}

export interface PolicySubject {
  id: string
  unitType: string
}

export interface PolicyFieldAttribution {
  policyId: string
  scope: PolicyLayerScope
  source: PolicySource
}

export interface ResolvedPolicyEnvelope {
  model: ModelPolicy
  overrides: Record<string, JsonValue>
  appliesTo: Required<PolicyAppliesTo>
  appliedPolicies: PolicyFieldAttribution[]
  attribution: {
    model: Partial<Record<keyof ModelPolicy, PolicyFieldAttribution>>
    overrides: Record<string, PolicyFieldAttribution>
    appliesToMetadata: Record<string, PolicyFieldAttribution>
  }
}

export interface ResolvePolicyInput {
  subject: PolicySubject
  defaultPolicy: ModelPolicy
  policies: PolicyLayer[]
}

const POLICY_SCOPE_ORDER: Record<PolicyLayerScope, number> = {
  global: 0,
  type: 1,
  unit: 2,
}

const MODEL_POLICY_KEYS = [
  'provider',
  'model',
  'temperature',
  'maxOutputTokens',
  'toolChoice',
  'allowedCapabilities',
  'systemPrompt',
] as const satisfies readonly (keyof ModelPolicy)[]

export function resolvePolicy(input: ResolvePolicyInput): ResolvedPolicyEnvelope {
  const matchedPolicies = input.policies
    .filter((policy) => policyMatchesSubject(policy, input.subject))
    .sort((left, right) => POLICY_SCOPE_ORDER[left.scope] - POLICY_SCOPE_ORDER[right.scope])

  const resolvedModel: ModelPolicy = {
    ...input.defaultPolicy,
  }
  const resolvedOverrides: Record<string, JsonValue> = {}
  const resolvedAppliesTo: Required<PolicyAppliesTo> = {
    metadata: {},
  }
  const attribution: ResolvedPolicyEnvelope['attribution'] = {
    model: {},
    overrides: {},
    appliesToMetadata: {},
  }

  for (const policy of matchedPolicies) {
    const source = toFieldAttribution(policy)

    if (policy.model) {
      for (const key of MODEL_POLICY_KEYS) {
        const value = policy.model[key]

        if (value !== undefined) {
          ;(
            resolvedModel as Record<keyof ModelPolicy, ModelPolicy[keyof ModelPolicy]>
          )[key] = clonePolicyValue(value) as ModelPolicy[keyof ModelPolicy]
          attribution.model[key] = source
        }
      }
    }

    if (policy.overrides) {
      for (const [key, value] of Object.entries(policy.overrides)) {
        resolvedOverrides[key] = clonePolicyValue(value)
        attribution.overrides[key] = source
      }
    }

    for (const [key, value] of Object.entries(policy.appliesTo?.metadata ?? {})) {
      resolvedAppliesTo.metadata[key] = clonePolicyValue(value)
      attribution.appliesToMetadata[key] = source
    }
  }

  return {
    model: resolvedModel,
    overrides: resolvedOverrides,
    appliesTo: resolvedAppliesTo,
    appliedPolicies: matchedPolicies.map(toFieldAttribution),
    attribution,
  }
}

function policyMatchesSubject(policy: PolicyLayer, subject: PolicySubject): boolean {
  if (policy.scope === 'global') {
    return true
  }

  if (policy.scope === 'type') {
    return policy.targetType === subject.unitType
  }

  return policy.targetId === subject.id
}

function toFieldAttribution(policy: PolicyLayer): PolicyFieldAttribution {
  return {
    policyId: policy.id,
    scope: policy.scope,
    source: policy.source,
  }
}

function clonePolicyValue<T extends JsonValue | ConnectorCapability[] | ToolChoiceMode | string | number | null>(
  value: T,
): T {
  if (Array.isArray(value)) {
    return [...value] as T
  }

  if (value && typeof value === 'object') {
    return { ...value } as T
  }

  return value
}

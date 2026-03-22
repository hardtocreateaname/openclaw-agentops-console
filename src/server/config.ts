import path from 'node:path'
import os from 'node:os'

import {
  ConnectorCapability,
  ModelProvider,
  PolicySource,
  ToolChoiceMode,
  type ModelPolicy,
} from '../shared/types'
import type { PolicyLayer } from './services/policy-engine'

export const DEFAULT_SERVER_PORT = 3000
export const DEFAULT_POLICY_STORE_PATH = path.resolve(
  process.cwd(),
  'var',
  'openclaw-agentops-policies.json',
)
export const DEFAULT_AGENTOPS_SOURCE_MODE = 'fixture'
export const DEFAULT_OPENCLAW_HISTORY_PATH = path.join(os.homedir(), '.codex', 'history.jsonl')
export const DEFAULT_OPENCLAW_TUI_LOG_PATH = path.join(os.homedir(), '.codex', 'log', 'codex-tui.log')
export const DEFAULT_OPENCLAW_VERSION_PATH = path.join(os.homedir(), '.codex', 'version.json')

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  provider: ModelProvider.OpenAI,
  model: 'gpt-5.4',
  temperature: 0.2,
  maxOutputTokens: 2048,
  toolChoice: ToolChoiceMode.Auto,
  allowedCapabilities: [
    ConnectorCapability.SessionRead,
    ConnectorCapability.RunRead,
    ConnectorCapability.EventStream,
    ConnectorCapability.PolicyResolve,
  ],
  systemPrompt: 'Default OpenClaw AgentOps operator policy.',
}

export const DEFAULT_POLICY_LAYERS: PolicyLayer[] = [
  {
    id: 'global-default',
    scope: 'global',
    source: PolicySource.Default,
    model: {
      provider: DEFAULT_MODEL_POLICY.provider,
      model: DEFAULT_MODEL_POLICY.model,
      temperature: DEFAULT_MODEL_POLICY.temperature,
      maxOutputTokens: DEFAULT_MODEL_POLICY.maxOutputTokens,
      toolChoice: DEFAULT_MODEL_POLICY.toolChoice,
      allowedCapabilities: DEFAULT_MODEL_POLICY.allowedCapabilities,
      systemPrompt: DEFAULT_MODEL_POLICY.systemPrompt,
    },
    overrides: {
      approvalMode: 'manual',
    },
    appliesTo: {
      metadata: {
        future: false,
      },
    },
  },
  {
    id: 'type-subagent-default',
    scope: 'type',
    source: PolicySource.Connector,
    targetType: 'subagent',
    model: {
      maxOutputTokens: 4096,
    },
    overrides: {
      reviewLane: 'analysis',
    },
  },
  {
    id: 'unit-subagent-001-runtime',
    scope: 'unit',
    source: PolicySource.Runtime,
    targetId: 'subagents:subagent-001',
    model: {
      systemPrompt: 'Prioritize planner escalation paths.',
    },
    overrides: {
      escalation: 'operator',
    },
    appliesTo: {
      metadata: {
        waiting: false,
      },
    },
  },
]

export interface ServerConfig {
  port: number
  policyStorePath: string
  defaultPolicy: ModelPolicy
  sourceMode: 'real' | 'fixture'
  openClaw: {
    historyPath: string
    tuiLogPath: string
    versionPath: string
  }
}

export function loadServerConfig(): ServerConfig {
  const requestedSourceMode = process.env.AGENTOPS_SOURCE_MODE
  const sourceMode = requestedSourceMode === 'real' ? 'real' : 'fixture'

  return {
    port: Number(process.env.PORT ?? DEFAULT_SERVER_PORT),
    policyStorePath: process.env.OPENCLAW_POLICY_STORE_PATH ?? DEFAULT_POLICY_STORE_PATH,
    defaultPolicy: DEFAULT_MODEL_POLICY,
    sourceMode,
    openClaw: {
      historyPath: process.env.OPENCLAW_HISTORY_PATH ?? DEFAULT_OPENCLAW_HISTORY_PATH,
      tuiLogPath: process.env.OPENCLAW_TUI_LOG_PATH ?? DEFAULT_OPENCLAW_TUI_LOG_PATH,
      versionPath: process.env.OPENCLAW_VERSION_PATH ?? DEFAULT_OPENCLAW_VERSION_PATH,
    },
  }
}

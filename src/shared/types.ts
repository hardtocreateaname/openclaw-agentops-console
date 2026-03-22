export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue
    }

export type ConnectorQualifiedId = string

export enum ConnectorCapability {
  SessionRead = 'session:read',
  SessionWrite = 'session:write',
  RunRead = 'run:read',
  RunWrite = 'run:write',
  EventStream = 'event:stream',
  PolicyResolve = 'policy:resolve',
}

export enum AgentStatus {
  Idle = 'idle',
  Running = 'running',
  Blocked = 'blocked',
  Offline = 'offline',
}

export enum ModelProvider {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Google = 'google',
  Local = 'local',
}

export enum ToolChoiceMode {
  Auto = 'auto',
  Required = 'required',
  None = 'none',
}

export enum PolicyScope {
  Global = 'global',
  Connector = 'connector',
  Session = 'session',
  Agent = 'agent',
}

export enum PolicySource {
  Default = 'default',
  Connector = 'connector',
  Operator = 'operator',
  Runtime = 'runtime',
}

export enum ActionKind {
  Approve = 'approve',
  Reject = 'reject',
  Interrupt = 'interrupt',
  Resume = 'resume',
  Terminate = 'terminate',
}

export enum ActionStatus {
  Accepted = 'accepted',
  Rejected = 'rejected',
  Queued = 'queued',
  Completed = 'completed',
  Failed = 'failed',
}

export enum EventKind {
  SessionStarted = 'session.started',
  SessionUpdated = 'session.updated',
  AgentRegistered = 'agent.registered',
  AgentUpdated = 'agent.updated',
  ActionRequested = 'action.requested',
  ActionCompleted = 'action.completed',
}

export interface AgentUnit {
  id: ConnectorQualifiedId
  connectorId: string
  sessionId: ConnectorQualifiedId | null
  name: string
  model: string
  provider: ModelProvider
  status: AgentStatus
  capabilities: ConnectorCapability[]
  lastSeenAt: string
  metadata: Record<string, JsonValue>
}

export interface ModelPolicy {
  provider: ModelProvider
  model: string
  temperature: number | null
  maxOutputTokens: number | null
  toolChoice: ToolChoiceMode
  allowedCapabilities: ConnectorCapability[]
  systemPrompt: string | null
}

export interface ResolvedPolicy {
  id: string
  scope: PolicyScope
  source: PolicySource
  connectorId: string | null
  targetId: ConnectorQualifiedId | null
  model: ModelPolicy
  overrides: Record<string, JsonValue>
  resolvedAt: string
}

export interface ActionResult {
  id: string
  action: ActionKind
  status: ActionStatus
  targetId: ConnectorQualifiedId
  message: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

export interface NormalizedEvent {
  id: string
  kind: EventKind
  connectorId: string
  subjectId: ConnectorQualifiedId
  sessionId: ConnectorQualifiedId | null
  agentId: ConnectorQualifiedId | null
  occurredAt: string
  payload: Record<string, JsonValue>
}

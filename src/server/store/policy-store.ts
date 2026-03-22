import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { PolicyLayer } from '../services/policy-engine'

export interface PolicyStore {
  list(): Promise<PolicyLayer[]>
  replace(policies: PolicyLayer[]): Promise<void>
}

export class MemoryPolicyStore implements PolicyStore {
  #policies: PolicyLayer[]

  constructor(seedPolicies: PolicyLayer[] = []) {
    this.#policies = clonePolicies(seedPolicies)
  }

  async list(): Promise<PolicyLayer[]> {
    return clonePolicies(this.#policies)
  }

  async replace(policies: PolicyLayer[]): Promise<void> {
    this.#policies = clonePolicies(policies)
  }
}

export class FilePolicyStore implements PolicyStore {
  readonly #filePath: string
  readonly #seedPolicies: PolicyLayer[]

  constructor(filePath: string, seedPolicies: PolicyLayer[] = []) {
    this.#filePath = filePath
    this.#seedPolicies = clonePolicies(seedPolicies)
  }

  async list(): Promise<PolicyLayer[]> {
    try {
      const contents = await readFile(this.#filePath, 'utf8')
      const parsed = JSON.parse(contents) as PolicyLayer[]
      return clonePolicies(parsed)
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }

      return clonePolicies(this.#seedPolicies)
    }
  }

  async replace(policies: PolicyLayer[]): Promise<void> {
    await mkdir(path.dirname(this.#filePath), { recursive: true })
    await writeFile(this.#filePath, JSON.stringify(policies, null, 2))
  }
}

export function createPolicyStore(input: {
  filePath?: string
  mode?: 'memory' | 'file'
  seedPolicies?: PolicyLayer[]
} = {}): PolicyStore {
  const { filePath, mode = 'file', seedPolicies = [] } = input

  if (mode === 'memory' || !filePath) {
    return new MemoryPolicyStore(seedPolicies)
  }

  return new FilePolicyStore(filePath, seedPolicies)
}

function clonePolicies(policies: PolicyLayer[]): PolicyLayer[] {
  return policies.map((policy) => ({
    ...policy,
    model: policy.model ? { ...policy.model } : undefined,
    overrides: policy.overrides ? { ...policy.overrides } : undefined,
    appliesTo: policy.appliesTo
      ? {
          metadata: {
            ...(policy.appliesTo.metadata ?? {}),
          },
        }
      : undefined,
  }))
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

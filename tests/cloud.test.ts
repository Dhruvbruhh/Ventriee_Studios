import { describe, expect, it, vi } from 'vitest'
import { SupabaseCloudClient } from '../src/main/cloud'
import type { CloudClient, Organization } from '../src/main/cloud/types'

const url = 'https://test-project.supabase.co'
const key = 'public-test-key'
const org: Organization = { id: 'org-1', name: 'Agency', owner_id: 'user-1', created_at: '2026-01-01T00:00:00Z' }

function client(token: string | null, impl: (input: string, init: RequestInit) => Response) {
  const request = vi.fn<typeof fetch>(async (input, init) => impl(String(input), init as RequestInit))
  return { cloud: new SupabaseCloudClient(url, key, () => token, request), request }
}

describe('SupabaseCloudClient', () => {
  it('sends the user token and apikey to PostgREST and parses rows', async () => {
    const { cloud, request } = client('tok', () => new Response(JSON.stringify([org])))
    expect(await cloud.listOrganizations()).toEqual([org])
    const [reqUrl, init] = request.mock.calls[0]
    expect(reqUrl).toBe(`${url}/rest/v1/organizations?select=*&order=created_at.asc`)
    expect((init as RequestInit).headers).toMatchObject({ apikey: key, Authorization: 'Bearer tok' })
  })

  it('refuses to call the cloud when signed out', async () => {
    const { cloud, request } = client(null, () => new Response('[]'))
    await expect(cloud.listOrganizations()).rejects.toThrow('Sign in')
    expect(request).not.toHaveBeenCalled()
  })

  it('returns the inserted row from a create and asks PostgREST to echo it', async () => {
    const { cloud, request } = client('tok', () => new Response(JSON.stringify([org])))
    expect(await cloud.createOrganization('Agency')).toEqual(org)
    const [, init] = request.mock.calls[0]
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({ Prefer: 'return=representation' })
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ name: 'Agency' })
  })

  it('scopes a personal-workspace listing with is.null, not an equality', async () => {
    const { cloud, request } = client('tok', () => new Response('[]'))
    await cloud.listProjects({ orgId: null })
    expect(String(request.mock.calls[0][0])).toContain('org_id=is.null')
    await cloud.listProjects({ orgId: 'org-1' })
    expect(String(request.mock.calls[1][0])).toContain('org_id=eq.org-1')
  })

  it('surfaces an RLS rejection as a no-access error', async () => {
    const { cloud } = client('tok', () => new Response('', { status: 403 }))
    await expect(cloud.listTasks('p1')).rejects.toThrow('access')
  })
})

// The rest of the app depends on CloudClient, so a fake is a drop-in for tests
// of consumers. This proves the interface is implementable without Supabase.
class FakeCloudClient implements CloudClient {
  orgs: Organization[] = []
  async listOrganizations() { return this.orgs }
  async createOrganization(name: string) { const o = { id: `o${this.orgs.length}`, name, owner_id: 'me', created_at: 'now' }; this.orgs.push(o); return o }
  async listMemberships() { return [] }
  async listProjects() { return [] }
  async createProject() { throw new Error('nyi') }
  async listTasks() { return [] }
  async createTask() { throw new Error('nyi') }
  async updateProject() { return null }
  async updateTask() { return null }
  async assignTask() { throw new Error('nyi') }
  async registerDevice() { throw new Error('nyi') }
  async listDevices() { return [] }
  async updateDevice() { throw new Error('nyi') }
  async enqueueCommand() { throw new Error('nyi') }
  async listCommands() { return [] }
  async claimCommand() { return null }
  async updateCommand() { return null }
  async listGrants() { return [] }
  async grantDevice() { throw new Error('nyi') }
  async revokeGrant() { /* no-op */ }
  async recordAudit() { throw new Error('nyi') }
  async listAudit() { return [] }
}

describe('CloudClient interface', () => {
  it('can be satisfied by a fake the app depends on', async () => {
    const fake: CloudClient = new FakeCloudClient()
    await fake.createOrganization('Agency')
    expect((await fake.listOrganizations())[0]?.name).toBe('Agency')
  })
})

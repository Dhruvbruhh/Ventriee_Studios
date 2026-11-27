// W43: invite a person to an organization by email.
// Runs as a Supabase Edge Function with the service-role key (set via
// `supabase secrets set`), because creating auth users is an admin operation
// the publishable key must never do. The caller's own JWT decides whether the
// invite is allowed: only an owner or admin of the target org may invite.
//
// Deploy (owner, one-time): see docs/cloud-setup.md → "Deploy the Edge Functions".
// Request:  POST { orgId, email, role }  with the caller's Authorization header.
// Response: { ok: true, invited: boolean, userId } or { error: string }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Same rules as web/src/lib/invite.ts (kept inline: the function runs on Deno
// Deploy, which cannot import from the web tree).
const ASSIGNABLE = new Set(['admin', 'project_manager', 'employee'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'content-type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors })

  try {
    // Who is calling? Their JWT, verified against the project, not the body.
    const auth = req.headers.get('Authorization') ?? ''
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: cors })

    const body = await req.json().catch(() => null) as { orgId?: string; email?: string; role?: string } | null
    const orgId = typeof body?.orgId === 'string' ? body.orgId : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = typeof body?.role === 'string' ? body.role : 'employee'
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) return new Response(JSON.stringify({ error: 'A valid organization is required' }), { status: 400, headers: cors })
    if (!EMAIL_RE.test(email)) return new Response(JSON.stringify({ error: 'A valid email is required' }), { status: 400, headers: cors })
    if (!ASSIGNABLE.has(role)) return new Response(JSON.stringify({ error: 'Role must be admin, project_manager or employee' }), { status: 400, headers: cors })

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Only an owner or admin of that org may invite into it.
    const { data: callerRow } = await admin.from('memberships')
      .select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
    if (!callerRow || !['owner', 'admin'].includes(callerRow.role)) {
      return new Response(JSON.stringify({ error: 'Only an owner or admin can invite members' }), { status: 403, headers: cors })
    }

    // Find the user, or create them with an invite email. inviteUserByEmail
    // sends the mail and creates the account; 422 means the address already
    // exists, so look the account up instead (paged: the default page can
    // hide the user).
    let userId: string | null = null
    let invited = false
    const invitedRes = await admin.auth.inviteUserByEmail(email)
    if (invitedRes.data.user) {
      userId = invitedRes.data.user.id
      invited = true
    } else {
      for (let page = 1; userId === null && page <= 20; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 500 })
        userId = data.users.find((u) => (u.email ?? '').toLowerCase() === email)?.id ?? null
        if (data.users.length < 500) break
      }
      if (!userId) {
        const msg = invitedRes.error?.message ?? 'Could not invite that email'
        return new Response(JSON.stringify({ error: msg }), { status: 400, headers: cors })
      }
    }

    // The membership row: skip silently when this person is already a member
    // (their existing role is kept, not overwritten).
    const { error: memberErr } = await admin.from('memberships')
      .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: 'org_id,user_id', ignoreDuplicates: true })
    if (memberErr) return new Response(JSON.stringify({ error: memberErr.message }), { status: 400, headers: cors })

    return new Response(JSON.stringify({ ok: true, invited, userId }), { headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Invite failed' }), { status: 500, headers: cors })
  }
})

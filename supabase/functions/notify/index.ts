// W44: send an Expo push notification to a user's registered devices.
// Runs as a Supabase Edge Function with the service-role key (bypasses RLS to
// read push_tokens). SERVICE KEY ONLY: the caller must present the service
// key — there is deliberately no user-JWT path, because any account holder
// could otherwise push arbitrary content to any other user's devices.
//
// Deploy (owner, one-time): see docs/cloud-setup.md → "Deploy the Edge Functions".
// Request:  POST { userId, title, body, data? }
// Response: { ok: true, sent: n } or { error: string }.
//
// Delivery goes through Expo's push API (https://exp.host/--/api/v2/push/send),
// so no APNs/FCM credentials are needed here — only the EAS project setup the
// mobile app already requires for token registration.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
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
    const body = await req.json().catch(() => null) as { userId?: string; title?: string; body?: string; data?: Record<string, unknown> } | null
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    const title = typeof body?.title === 'string' ? body.title.slice(0, 120) : ''
    const text = typeof body?.body === 'string' ? body.body.slice(0, 300) : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return new Response(JSON.stringify({ error: 'A valid userId is required' }), { status: 400, headers: cors })
    }
    if (!title || !text) return new Response(JSON.stringify({ error: 'title and body are required' }), { status: 400, headers: cors })

    // Service key only. A user-JWT path would let any account holder push
    // arbitrary content to any other user's devices, so it is not offered.
    const auth = req.headers.get('Authorization') ?? ''
    if (auth !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: 'Service key required' }), { status: 401, headers: cors })
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', userId)
    if (!tokens?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: cors })

    // Expo accepts batches of up to 100 messages.
    const messages = tokens.map((t) => ({ to: t.token, title, body: text, data: body?.data ?? {} }))
    let sent = 0
    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      })
      if (res.ok) sent += Math.min(100, messages.length - i)
    }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Notify failed' }), { status: 500, headers: cors })
  }
})

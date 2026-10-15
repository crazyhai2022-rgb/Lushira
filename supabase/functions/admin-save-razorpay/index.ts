// Admin-only. Validates Razorpay keys against Razorpay, stores the secret server-side and switches online payments on.
import { admin, cors, getUser, json } from './util.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const user = await getUser(req)
  if (!user) return json({ error: 'Please log in again.' }, 401)
  const db = admin()
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle()
  if (!role) return json({ error: 'Forbidden' }, 403)
  const body = await req.json().catch(() => ({}))
  const now = new Date().toISOString()

  const status = async () => {
    const { data: s } = await db.from('app_settings').select('value').eq('key', 'razorpay_key_id').maybeSingle()
    const { data: sec } = await db.from('payment_secrets').select('key').in('key', ['razorpay_key_secret', 'razorpay_webhook_secret'])
    const keyId = typeof s?.value === 'string' ? s.value : ''
    const has = (k: string) => !!sec?.some((x) => x.key === k)
    return { configured: !!keyId && has('razorpay_key_secret'), key_id: keyId, mode: keyId.startsWith('rzp_live_') ? 'live' : keyId ? 'test' : null, has_webhook_secret: has('razorpay_webhook_secret') }
  }

  if (body.action === 'status') return json(await status())

  if (body.action === 'clear') {
    await db.from('payment_secrets').delete().in('key', ['razorpay_key_secret', 'razorpay_webhook_secret'])
    await db.from('app_settings').update({ value: '', updated_at: now }).eq('key', 'razorpay_key_id')
    await db.from('audit_logs').insert({ actor_id: user.id, action: 'razorpay_disconnected', entity: 'settings', entity_id: 'razorpay' })
    return json(await status())
  }

  if (body.action === 'save') {
    const keyId = String(body.key_id ?? '').trim(), secret = String(body.key_secret ?? '').trim(), wh = String(body.webhook_secret ?? '').trim()
    if (!/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(keyId)) return json({ error: 'Key ID should look like rzp_test_xxxx or rzp_live_xxxx.' }, 400)
    if (secret.length < 10) return json({ error: 'Enter the Key Secret from Razorpay.' }, 400)
    const check = await fetch('https://api.razorpay.com/v1/orders?count=1', { headers: { Authorization: 'Basic ' + btoa(`${keyId}:${secret}`) } })
    if (check.status === 401) return json({ error: 'Razorpay rejected these keys. Check the Key ID and Secret (same mode, no spaces).' }, 400)
    if (!check.ok) return json({ error: 'Could not verify keys with Razorpay right now. Try again.' }, 502)
    const rows = [{ key: 'razorpay_key_secret', value: secret, updated_by: user.id, updated_at: now }]
    if (wh) rows.push({ key: 'razorpay_webhook_secret', value: wh, updated_by: user.id, updated_at: now })
    const up = await db.from('payment_secrets').upsert(rows)
    if (up.error) { console.error(up.error); return json({ error: 'Could not save keys.' }, 500) }
    await db.from('app_settings').update({ value: keyId, updated_at: now }).eq('key', 'razorpay_key_id')
    await db.from('app_settings').update({ value: true, updated_at: now }).eq('key', 'online_payments_enabled')
    await db.from('audit_logs').insert({ actor_id: user.id, action: 'razorpay_connected', entity: 'settings', entity_id: 'razorpay', details: { key_id: keyId } })
    return json(await status())
  }
  return json({ error: 'Invalid action' }, 400)
})

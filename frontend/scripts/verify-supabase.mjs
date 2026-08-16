// Temporary verification script — read-only checks against the live Supabase project.
// Loads env from frontend/.env.local, prints only non-sensitive facts (no secrets).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env.local')
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anon || !service) {
  console.error('Missing env vars in .env.local')
  process.exit(1)
}

const ref = new URL(url).hostname.split('.')[0]
console.log('Project ref:', ref)
console.log('Key lengths — anon:', anon.length, '| service:', service.length)
console.log('Key prefixes — anon:', anon.slice(0, 10), '| service:', service.slice(0, 10))

async function restProbe(key, label, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  let body = ''
  try { body = (await res.text()).slice(0, 160) } catch {}
  // RLS filters rows instead of erroring: 200 + [] means RLS is active,
  // 200 + rows means the table is still open.
  console.log(`[${label}] ${path}: HTTP ${res.status} -> ${body || '(empty)'}`)
  return res.status
}

async function main() {
  // 1) Which keys are valid?
  await restProbe(anon, 'anon ', 'orders?select=id&limit=1')
  const svcStatus = await restProbe(service, 'service', 'orders?select=id&limit=1')

  // 2) Anon reachability of messages / users (RLS indicator)
  await restProbe(anon, 'anon ', 'messages?select=id&limit=1')
  await restProbe(anon, 'anon ', 'users?select=id&limit=1')

  // 3) Bucket state (via anon or service depending on what works)
  const bucketKey = svcStatus < 400 ? service : anon
  const bucketRes = await fetch(`${url}/storage/v1/bucket/assignments`, {
    headers: { apikey: bucketKey, Authorization: `Bearer ${bucketKey}` },
  })
  if (bucketRes.ok) {
    const b = await bucketRes.json()
    console.log('Bucket "assignments": public =', b.public, '| file_size_limit =', b.file_size_limit ?? null)
  } else {
    const t = await bucketRes.text()
    console.log('Bucket "assignments": HTTP', bucketRes.status, '->', t.slice(0, 160), '(404/400 for anon is expected once the bucket is private)')
  }

  // 4) Realtime channel status (subscribe, wait, report — no writes)
  const { createClient } = await import('@supabase/supabase-js')
  const rt = createClient(url, anon)
  const channel = rt.channel('verify-probe')
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {})
  channel.subscribe()
  await new Promise((r) => setTimeout(r, 4000))
  console.log('Realtime channel state after 4s:', channel.state)
  const socketState = rt.realtime.getChannels().map((c) => c.state)
  console.log('Realtime socket/channel states:', JSON.stringify(socketState))
  await rt.removeChannel(channel)
  process.exit(0)
}

main().catch((e) => {
  console.error('Verification failed:', e.message)
  process.exit(1)
})

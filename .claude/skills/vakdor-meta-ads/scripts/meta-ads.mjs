// CLI de Meta Marketing API para Vakdor (cuentas publicitarias de Instagram/Facebook).
// Autentica con META_TOKEN_PERMANENTE del .env (system user Leonardo_Vakdor, permanente,
// scopes ads_read + ads_management + whatsapp_*). Endpoints verificados en vivo (v23.0).
//
// LECTURA (libre):
//   node meta-ads.mjs accounts                          -> cuentas de ads accesibles
//   node meta-ads.mjs campaigns [--act <id>]            -> campañas (nombre, estado, objetivo)
//   node meta-ads.mjs adsets --campaign <id>            -> ad sets de una campaña
//   node meta-ads.mjs ads --adset <id>                  -> ads de un ad set
//   node meta-ads.mjs insights [--act|--campaign|--adset|--ad <id>] [--preset last_7d] [--level account]
//   node meta-ads.mjs get <node-id> [--fields a,b]      -> objeto crudo por id
//
// ESCRITURA (SOLO con OK explícito de Leonardo — ver SKILL.md):
//   node meta-ads.mjs pause <id>                        -> pausa campaña/adset/ad
//   node meta-ads.mjs activate <id>                     -> activa campaña/adset/ad
//   node meta-ads.mjs create-campaign --name "..." --objective OUTCOME_TRAFFIC [--status PAUSED]
//   node meta-ads.mjs raw POST /act_<id>/campaigns --data '{"name":"..."}'
//
// Flags globales: --json (salida cruda), --act <id> (cuenta; default Instagram_Ads),
//   --version v23.0
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
for (const p of [path.resolve(process.cwd(), '.env'), path.resolve(here, '../../../../.env')]) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break }
}

const TOKEN = process.env.META_TOKEN_PERMANENTE || process.env.META_API_KEY
if (!TOKEN) {
  console.error('Falta META_TOKEN_PERMANENTE en el .env del repo.')
  process.exit(1)
}

const argv = process.argv.slice(2)
const cmd = argv[0]
const positional = argv.slice(1).filter((a) => !a.startsWith('--'))
const flag = (name) => argv.includes(`--${name}`)
const val = (name, def = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def }

const VERSION = val('version', 'v23.0')
const DEFAULT_ACT = '583233341182808' // Instagram_Ads
const BASE = `https://graph.facebook.com/${VERSION}`
const asJson = flag('json')

async function api(method, node, params = {}, body = null) {
  const url = new URL(`${BASE}/${node.replace(/^\//, '')}`)
  const opts = { method, headers: {} }
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v)
    url.searchParams.set('access_token', TOKEN)
  } else {
    const form = new URLSearchParams({ ...params, ...(body || {}), access_token: TOKEN })
    opts.body = form
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  const res = await fetch(url, opts)
  const j = await res.json()
  if (j.error) throw new Error(`${j.error.type || 'API'} (${j.error.code}): ${j.error.message}`)
  return j
}

function actNode() {
  const id = val('act', DEFAULT_ACT)
  return `act_${id}`
}

function print(data) {
  if (asJson) { console.log(JSON.stringify(data, null, 2)); return }
  return null // el caller imprime su resumen legible
}

async function main() {
  switch (cmd) {
    case 'accounts': {
      const j = await api('GET', 'me/adaccounts', { fields: 'name,account_id,account_status,currency,amount_spent', limit: 50 })
      if (print(j)) return
      console.log('\nCuentas de ads:')
      for (const a of j.data || []) {
        const st = a.account_status === 1 ? 'ACTIVA' : `status ${a.account_status}`
        console.log(`  act_${a.account_id}  ${a.name || '(sin nombre)'}  ${a.currency}  ${st}  gastado hist: ${a.amount_spent}`)
      }
      break
    }
    case 'campaigns': {
      const j = await api('GET', `${actNode()}/campaigns`, { fields: 'name,status,objective,daily_budget,lifetime_budget,created_time', limit: 100 })
      if (print(j)) return
      console.log(`\nCampañas (${actNode()}):`)
      if (!(j.data || []).length) console.log('  (ninguna)')
      for (const c of j.data || []) {
        const budget = c.daily_budget ? `$${(c.daily_budget / 100).toFixed(2)}/día` : c.lifetime_budget ? `$${(c.lifetime_budget / 100).toFixed(2)} total` : 'presup. en ad set'
        console.log(`  ${c.id}  [${c.status}]  ${c.name}  · ${c.objective || ''}  · ${budget}`)
      }
      break
    }
    case 'adsets': {
      const camp = val('campaign')
      if (!camp) { console.error('Falta --campaign <id>'); process.exit(1) }
      const j = await api('GET', `${camp}/adsets`, { fields: 'name,status,daily_budget,optimization_goal,billing_event,targeting', limit: 100 })
      if (print(j)) return
      console.log(`\nAd sets de la campaña ${camp}:`)
      for (const s of j.data || []) {
        const budget = s.daily_budget ? `$${(s.daily_budget / 100).toFixed(2)}/día` : ''
        console.log(`  ${s.id}  [${s.status}]  ${s.name}  · ${s.optimization_goal || ''}  ${budget}`)
      }
      break
    }
    case 'ads': {
      const adset = val('adset')
      if (!adset) { console.error('Falta --adset <id>'); process.exit(1) }
      const j = await api('GET', `${adset}/ads`, { fields: 'name,status,creative', limit: 100 })
      if (print(j)) return
      console.log(`\nAds del ad set ${adset}:`)
      for (const a of j.data || []) console.log(`  ${a.id}  [${a.status}]  ${a.name}`)
      break
    }
    case 'insights': {
      // objeto: --ad / --adset / --campaign / --act (default cuenta)
      const node = val('ad') || val('adset') || val('campaign') || actNode()
      const params = {
        fields: val('fields', 'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type'),
        date_preset: val('preset', 'last_30d'),
      }
      if (val('level')) params.level = val('level')
      if (val('breakdown')) params.breakdowns = val('breakdown')
      if (val('since') && val('until')) { params.time_range = JSON.stringify({ since: val('since'), until: val('until') }); delete params.date_preset }
      const j = await api('GET', `${node}/insights`, params)
      if (print(j)) return
      console.log(`\nInsights (${node}, ${params.date_preset || 'rango custom'}):`)
      const rows = j.data || []
      if (!rows.length) { console.log('  (sin datos / sin gasto en el período)'); break }
      for (const r of rows) {
        console.log(`  gasto: $${r.spend || 0} · impresiones: ${r.impressions || 0} · clicks: ${r.clicks || 0} · CTR: ${r.ctr || 0}% · CPC: $${r.cpc || 0} · alcance: ${r.reach || 0}`)
        if (r.actions) for (const a of r.actions) console.log(`     ${a.action_type}: ${a.value}`)
      }
      break
    }
    case 'get': {
      const id = positional[0]
      if (!id) { console.error('Uso: get <node-id> [--fields a,b]'); process.exit(1) }
      const j = await api('GET', id, { fields: val('fields', 'id,name,status') })
      console.log(JSON.stringify(j, null, 2))
      break
    }
    // ---- ESCRITURA (requiere OK explícito de Leonardo, ver SKILL.md) ----
    case 'pause':
    case 'activate': {
      const id = positional[0]
      if (!id) { console.error(`Uso: ${cmd} <id>`); process.exit(1) }
      const status = cmd === 'pause' ? 'PAUSED' : 'ACTIVE'
      const j = await api('POST', id, {}, { status })
      console.log(`${cmd} ${id} ->`, JSON.stringify(j))
      break
    }
    case 'create-campaign': {
      const name = val('name'); const objective = val('objective', 'OUTCOME_TRAFFIC')
      if (!name) { console.error('Falta --name'); process.exit(1) }
      const body = { name, objective, status: val('status', 'PAUSED'), special_ad_categories: '[]' }
      const j = await api('POST', `${actNode()}/campaigns`, {}, body)
      console.log('Campaña creada ->', JSON.stringify(j))
      break
    }
    case 'raw': {
      const method = positional[0]; const node = positional[1]
      if (!method || !node) { console.error('Uso: raw <GET|POST> <path> [--data \'{...}\']'); process.exit(1) }
      const data = val('data') ? JSON.parse(val('data')) : null
      const j = await api(method.toUpperCase(), node, {}, data)
      console.log(JSON.stringify(j, null, 2))
      break
    }
    default:
      console.log('Comandos: accounts | campaigns | adsets --campaign <id> | ads --adset <id> | insights [--campaign/--adset/--ad <id>] [--preset] | get <id> | pause/activate <id> | create-campaign --name --objective | raw')
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })

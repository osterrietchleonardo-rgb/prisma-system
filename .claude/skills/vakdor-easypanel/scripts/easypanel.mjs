// Cliente de estado de EasyPanel (panel.vakdor.com). Solo LECTURA.
// Renderiza la vista de proyectos -> servicios con punto de estado (verde/rojo/gris),
// igual que el navegador de proyectos del panel.
//
// Uso:
//   node easypanel.mjs                 -> estado de todos los servicios (con salud)
//   node easypanel.mjs --fast          -> solo config (enabled), sin chequear salud
//   node easypanel.mjs --inspect n8n   -> detalle de un servicio (imagen, env, recursos, mounts, ports)
//   node easypanel.mjs --json          -> JSON crudo de projects.listProjectsAndServices
//
// Endpoints (tRPC, verificados en v2.32.1):
//   projects.listProjectsAndServices (GET)      -> proyectos + servicios + config
//   services.common.getServiceError  (GET)      -> null = sano; objeto = error de deploy/runtime
//   services.<tipo>.inspectService   (GET)      -> config completa del servicio
// Auth: header Authorization: Bearer <EASYPANEL_API_KEY>.
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

// Busca el .env: primero el cwd (raiz del repo), si no, sube desde este script.
const here = path.dirname(fileURLToPath(import.meta.url))
for (const p of [path.resolve(process.cwd(), '.env'), path.resolve(here, '../../../../.env')]) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break }
}

const token = process.env.EASYPANEL_API_KEY
if (!token) {
  console.error('Falta EASYPANEL_API_KEY (ponelo en el .env del repo o export EASYPANEL_API_KEY=...)')
  process.exit(1)
}
const BASE = process.env.EASYPANEL_URL || 'https://panel.vakdor.com'

async function trpc(proc, input) {
  const qs = input ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : ''
  const res = await fetch(`${BASE}/api/trpc/${proc}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${proc} -> ${res.status}: ${text}`)
  return JSON.parse(text).json
}

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const val = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }

const DOT = { green: '\x1b[32m●\x1b[0m', red: '\x1b[31m●\x1b[0m', gray: '\x1b[90m●\x1b[0m' }
const typeRouter = (t) => (t === 'app' ? 'app' : t) // postgres/redis/mysql/mongo comparten nombre

async function main() {
  if (val('--inspect')) {
    const name = val('--inspect')
    const data = await trpc('projects.listProjectsAndServices')
    const sv = data.services.find((s) => s.name === name)
    if (!sv) { console.error(`No existe el servicio "${name}"`); process.exit(1) }
    const full = await trpc(`services.${typeRouter(sv.type)}.inspectService`, {
      projectName: sv.projectName, serviceName: sv.name,
    })
    console.log(JSON.stringify(full, null, 2))
    return
  }

  const data = await trpc('projects.listProjectsAndServices')

  if (flag('--json')) { console.log(JSON.stringify(data, null, 2)); return }

  // Salud por servicio (en paralelo), salvo --fast.
  const fast = flag('--fast')
  const errByKey = new Map()
  if (!fast) {
    await Promise.all(data.services.map(async (sv) => {
      const key = `${sv.projectName}/${sv.name}`
      try {
        const err = await trpc('services.common.getServiceError', {
          projectName: sv.projectName, serviceName: sv.name,
        })
        errByKey.set(key, err)
      } catch (e) { errByKey.set(key, { message: `check fallo: ${e.message}` }) }
    }))
  }

  console.log(`\nEasyPanel — ${BASE}`)
  // Agrupa por proyecto (como el navegador del panel).
  for (const proj of data.projects) {
    const svcs = data.services.filter((s) => s.projectName === proj.name)
    console.log(`\n▸ ${proj.name}  (${svcs.length} servicios)`)
    console.log(`  ${'─'.repeat(46)}`)
    for (const sv of svcs) {
      const key = `${sv.projectName}/${sv.name}`
      const err = errByKey.get(key)
      let dot, word
      if (!sv.enabled) { dot = DOT.gray; word = 'apagado' }
      else if (fast) { dot = DOT.green; word = 'habilitado' }
      else if (err == null) { dot = DOT.green; word = 'en línea' }
      else { dot = DOT.red; word = 'ERROR' }
      const nm = sv.name.padEnd(24)
      console.log(`  ${dot} ${nm} ${(sv.type || '?').padEnd(9)} ${word}`)
      if (err) console.log(`      ↳ ${err.message || JSON.stringify(err)}`)
    }
  }
  console.log('')
}

main().catch((e) => { console.error(e.message); process.exit(1) })

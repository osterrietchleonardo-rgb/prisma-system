#!/usr/bin/env node
/**
 * Abre el perfil de cada contacto del pipeline y le saca la INFORMACION DE CONTACTO
 * que LinkedIn muestra: email, telefono y sitio web.
 *
 *   node .claude/skills/vakdor-socio/scripts/sacar-contacto-linkedin.mjs [estado]
 *
 * Por defecto trabaja sobre los que estan en "sin contactar".
 *
 * NUNCA manda un mensaje ni una invitacion. Solo lee.
 *
 * LIMITE CONOCIDO: LinkedIn muestra el email SOLO si sos contacto de 1er grado o si la
 * persona lo hizo publico. Con un 2do o 3er grado el modal abre igual pero viene sin mail.
 * Eso no es un error del script: es como funciona LinkedIn.
 *
 * MANTENIMIENTO: el modal NO se abre navegando a /overlay/contact-info/ — esa URL redirige
 * al perfil. Hay que hacer CLICK en el enlace "Informacion de contacto". Y el contenido no
 * se lee del innerText del modal (que vuelve vacio): se busca el patron de email en el HTML
 * completo, filtrando los dominios de LinkedIn. Paso el 21/08/2026.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../../..');
const ESTADO = process.argv[2] || 'sin contactar';

const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ,'.env'),'utf8').split('\n')
  .map(l=>l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const ids = JSON.parse(fs.readFileSync(path.join(RAIZ,'scratch/clickup-ids.json'),'utf8'));
const H = { Authorization: env.CLICKUP_API_KEY, 'Content-Type':'application/json' };
const B = 'https://api.clickup.com/api/v2';
const NL = String.fromCharCode(10);

const CLI = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/playwright-cli.js');
const pw = (args) => execFileSync(process.execPath, [CLI, '-s=linkedin', '--raw', ...args],
  { encoding:'utf8', maxBuffer: 20*1024*1024, cwd: RAIZ }).trim();
const json = (s) => { try { return JSON.parse(JSON.parse(s)); } catch { try { return JSON.parse(s); } catch { return null; } } };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
/** Pausa variable: parecerse a una persona mirando perfiles, no a un robot. */
const pausaHumana = () => dormir(4000 + Math.random()*4000);

const JS_ABRIR_Y_LEER = String.raw`async page => {
  const a = page.locator('a:has-text("Información de contacto")').first();
  if (await a.count() === 0) return JSON.stringify({ sinBoton: true });
  await a.click();
  await page.waitForTimeout(5500);
  const r = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    const malos = /licdn|linkedin\.com|\.png|\.jpg|\.gif|\.svg|sentry|example\.com|schema\.org|w3\.org/i;
    const mails = [...new Set(html.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi) || [])].filter(m => !malos.test(m));
    const sitios = [...new Set(html.match(/https?:\/\/(?!www\.linkedin|media\.licdn|static\.licdn)[\w.-]+\.[a-z]{2,}[^"'<>\s]{0,40}/gi) || [])]
      .filter(u => !/licdn|linkedin|w3\.org|schema\.org|googleapis|gstatic/i.test(u)).slice(0, 3);
    const dlg = document.querySelector('.artdeco-modal, [role=dialog]');
    const txt = dlg ? dlg.innerText.replace(/\s+/g, ' ') : '';
    const tel = (txt.match(/\+?\d[\d\s().-]{8,}\d/) || [])[0] || null;
    return { mails: mails.slice(0, 3), sitios, tel };
  });
  return JSON.stringify(r);
}`;

const JS_CAPTCHA = String.raw`(() => { const t = document.body.innerText.replace(/\s+/g,' ');
  return JSON.stringify({ captcha: /captcha|security check|unusual activity|restringid|verifica tu identidad/i.test(t) }); })()`;

// -------------------------------------------------------------------------- main

const r0 = await fetch(`${B}/list/${ids.lPipeline}/task?include_closed=true`, {headers:H, signal:AbortSignal.timeout(30000)});
const tasks = ((await r0.json()).tasks || []).filter(t => t.status?.status === ESTADO);
console.log('en "' + ESTADO + '":', tasks.length);

const RE_IDENT = /linkedin\.com\/(?:in\/|messaging\/thread\/new\/\?recipient=)([^/?#\s)]+)/;
let leidos = 0, conMail = 0, sinBoton = 0;

for (const t of tasks) {
  const m = (t.description || '').match(RE_IDENT);
  if (!m) { console.log('SIN PERFIL', t.name); continue; }
  const ident = m[1];

  pw(['goto', 'https://www.linkedin.com/in/' + ident + '/']);
  await dormir(6000 + Math.random()*2000);

  const est = json(pw(['eval', JS_CAPTCHA]));
  if (est?.captcha) { console.log('!! LinkedIn pidio verificacion. SE FRENA TODO.'); break; }

  let r = null;
  try { r = json(pw(['run-code', JS_ABRIR_Y_LEER])); } catch (e) { r = { error: String(e).slice(0,100) }; }
  leidos++;

  if (r?.sinBoton) { sinBoton++; console.log('sin boton  ', t.name, '(probablemente no es contacto de 1er grado)'); await pausaHumana(); continue; }

  const mail = (r?.mails || [])[0] || null;
  const tel = r?.tel || null;
  const sitio = (r?.sitios || [])[0] || null;
  if (mail) conMail++;

  console.log((mail ? 'MAIL ' : '     '), t.name, '->', mail || 'sin mail', tel ? ('| tel ' + tel) : '', sitio ? ('| ' + sitio) : '');

  if (mail || tel || sitio) {
    const bloque = ['', '--- INFORMACION DE CONTACTO (sacada de su perfil de LinkedIn) ---',
      mail  ? 'Email: ' + mail   : null,
      tel   ? 'Telefono: ' + tel : null,
      sitio ? 'Sitio: ' + sitio  : null,
      'Leido el ' + new Date().toISOString().slice(0,10) + '.'].filter(Boolean).join(NL);
    const nueva = (t.description || '').replace(/[\r\n]*--- INFORMACION DE CONTACTO[\s\S]*$/, '') + NL + bloque;
    await fetch(`${B}/task/${t.id}`, {method:'PUT', headers:H, body: JSON.stringify({description: nueva}), signal:AbortSignal.timeout(30000)});
  }
  await pausaHumana();
}

console.log(NL + 'perfiles leidos: ' + leidos + ' | con email: ' + conMail + ' | sin boton de contacto: ' + sinBoton);

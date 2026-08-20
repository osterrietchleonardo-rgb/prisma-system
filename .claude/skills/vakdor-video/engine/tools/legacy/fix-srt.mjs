// fix-srt.mjs — Corrige errores de transcripción (marca/jerga) sobre el SRT, preservando timings.
//   node fix-srt.mjs --in=subs.srt --out=subs.fixed.srt
import fs from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

let txt = fs.readFileSync(args.in, "utf8");

// Reemplazos ordenados: primero frases específicas, luego términos.
const reps = [
  // --- Correcciones específicas de presentación ---
  [/ayudo a directores y monederos/gi, "ayudo a directores inmobiliarios"],
  [/directores y monederos/gi, "directores inmobiliarios"],
  [/Baddor|Backdoor/gi, "Vakdor"],
  [/creador de clip/gi, "creador de PRISMA"],
  [/el toco o el CRM|el topo o el CRM/gi, "el Tokko o el CRM"],
  [/TOCO|Topo/g, "Tokko"],
  [/toco/gi, "Tokko"],

  // --- Fuentes de mercado ---
  [/zona prop index|zonaprop index/gi, "Zonaprop Index"],
  [/como lo que es clímax|como lo que es climax/gi, "como lo que es el clima"],
  [/clímax|climax/gi, "clima"],
  [/o en un sema|o de no sema|de no sema/gi, "o de CEMA"],

  // --- Términos técnicos inmobiliarios / SaaS ---
  [/pre-linking|prelinking/gi, "pre-listing"],
  [/pre-buying/gi, "pre-buying"],
  [/infraestructura del[ií]a/gi, "infraestructura de IA"],
  [/traseguridad total|transferida total/gi, "trazabilidad total"],
  [/trasciabilidad|traceabilidad/gi, "trazabilidad"],
  [/métricas de calculación/gi, "métricas de facturación"],
  [/capturaciones, tanta capturación/gi, "facturación, tanta facturación"],
  [/list de Tokko|list de TOCO/gi, "leads de Tokko"],
  [/google candela calendar|candela calendar/gi, "Google Calendar"],
  [/Variante 1 de Paz/gi, "Variante 1 de PAS"],
  [/tiempo raro/gi, "tiempo extra"],
  [/oficiales del nuevo libro/gi, "oficiales del negocio"],
  [/como racionista/gi, "como director"],

  // --- Marca PRISMA ---
  [/\bPrisma\b/g, "PRISMA"],
  [/desarrollamos Prism\b\.?/g, "desarrollamos PRISMA."],
];

for (const [re, val] of reps) txt = txt.replace(re, val);

fs.writeFileSync(args.out, txt, "utf8");
console.log(`✓ SRT corregido con éxito -> ${args.out}`);

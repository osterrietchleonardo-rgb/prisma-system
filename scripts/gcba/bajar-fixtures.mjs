// scripts/gcba/bajar-fixtures.mjs
// Baja a lib/prefactibilidad/__fixtures__/ lo que necesitan los tests: teselas oficiales de
// Ciudad 3D (zoom 17) y geometrías del catastro para las parcelas de prueba. Se corre UNA vez
// (o cuando el GCBA cambie el dato y haya que renovar la evidencia): los tests no tocan la red.
//   node scripts/gcba/bajar-fixtures.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DESTINO = path.join(RAIZ, "lib", "prefactibilidad", "__fixtures__");
const UA = "PRISMA-prefactibilidad/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";

// smp → [lng, lat] del centroide (catastro epok). Roosevelt 4554 es el caso con número de
// TodoProps (263 m²/planta); Zuviría, manzana atípica; Cabildo, dos unidades (CM y CA).
const PARCELAS = {
  "053-050-006": [-58.4808, -34.5703],
  "056-068-040B": [-58.470035, -34.654211],
  "039-097-008B": [-58.456744, -34.562934],
  "048-026-005": [-58.4636, -34.6421],
  "042-077A-007": [-58.4475, -34.6236],
};
const CAPAS = ["volumen_edif", "lfi", "lib", "banda_minima", "manzana", "linea_oficial"];
const Z = 17;

function tesela(lng, lat) {
  const n = 2 ** Z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const la = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
  return { z: Z, x, y };
}

async function bajar(url, archivo) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  fs.writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
  console.log("  ok", path.basename(archivo));
}

fs.mkdirSync(DESTINO, { recursive: true });
for (const [smp, [lng, lat]] of Object.entries(PARCELAS)) {
  const sm = smp.slice(0, 7);
  const t = tesela(lng, lat);
  console.log(smp, `tesela ${t.z}/${t.x}/${t.y}`);
  for (const capa of CAPAS) {
    await bajar(`https://vectortiles.usig.buenosaires.gob.ar/cur3d/${capa}/${t.z}/${t.x}/${t.y}.pbf`, path.join(DESTINO, `${capa}-${t.z}-${t.x}-${t.y}.pbf`));
  }
  await bajar(`https://epok.buenosaires.gob.ar/catastro/parcela/?smp=${smp}`, path.join(DESTINO, `${smp}.parcela.json`));
  await bajar(`https://epok.buenosaires.gob.ar/catastro/geometria/?smp=${smp}&srid=4326`, path.join(DESTINO, `${smp}.lote.geojson`));
  await bajar(`https://epok.buenosaires.gob.ar/catastro/geometria/?sm=${sm}&srid=4326`, path.join(DESTINO, `${sm}.manzana.geojson`));
}
fs.writeFileSync(path.join(DESTINO, "README.md"), `Dato oficial del GCBA bajado el ${new Date().toISOString().slice(0, 10)} con scripts/gcba/bajar-fixtures.mjs. No editar a mano.\n`);

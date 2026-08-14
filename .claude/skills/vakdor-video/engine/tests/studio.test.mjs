import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsearArgs } from "../studio.mjs";
import { crearClipDePrueba, dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

const STUDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "studio.mjs");
// SIN_GROQ: entorno SIN GROQ_API_KEY para todo proceso hijo que corra studio.mjs. El
// paso 2 del pipeline (transcribir) pega a una API que CUESTA PLATA por llamada — si
// la maquina que corre estas pruebas tuviera GROQ_API_KEY seteada en el shell (se usa
// para trabajo real de produccion), estas pruebas dispararian llamadas reales sin
// querer. Blanquear la key ademas prueba a proposito el camino "segui sin transcribir".
const SIN_GROQ = { ...process.env, GROQ_API_KEY: "" };
let dir, clip, clipLargo, clipChico;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 8, salida: path.join(dir, "in.mp4") });
  // Clip mas largo que la ventana de preview (20s), chico en resolucion para que
  // el render extra no vuelva lenta la prueba. Sirve para verificar que el recorte
  // de preview arranca EXACTO donde se pide y no en el keyframe mas cercano.
  clipLargo = crearClipDePrueba({ segundos: 30, ancho: 640, alto: 360, salida: path.join(dir, "largo.mp4") });
  // Chico y corto a proposito: --estabilizar hace 2 pasadas de vidstab ADEMAS del
  // corte y el compose normales, y las pruebas de wiring de Task 10 no necesitan
  // resolucion real para verificar que el flag se enchufo bien.
  clipChico = crearClipDePrueba({ segundos: 3, ancho: 480, alto: 270, salida: path.join(dir, "chico.mp4") });
});
after(() => borrarDirDePrueba(dir));

const archivosResiduales = (d) =>
  fs.readdirSync(d).filter((f) =>
    f.startsWith(".preview-fuente") || f.startsWith(".studio-corte") || f.startsWith(".studio-estab") || f.endsWith(".trf"));
// El cache de corte/transcripcion (Fix 4 del round 1 de revision) vive en una
// subcarpeta ".studio-cache" DENTRO de `dir` y es INTENCIONALMENTE persistente entre
// corridas (para eso sirve un cache) — no es un residuo, asi que `archivosResiduales`
// (que barre la carpeta plana) nunca lo va a marcar solo por existir.

test("parsea flags con y sin valor", () => {
  const a = parsearArgs(["--in=x.mp4", "--formato=9:16", "--check"]);
  assert.equal(a.in, "x.mp4");
  assert.equal(a.formato, "9:16");
  assert.equal(a.check, true);
});

test("--check valida sin renderizar y no deja archivos temporales", () => {
  const salida = path.join(dir, "no-deberia-existir.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--check"], { encoding: "utf8", env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /receta|grafo/i);
  assert.equal(fs.existsSync(salida), false, "--check no tiene que escribir el video");
  assert.deepEqual(archivosResiduales(dir), [], "--check no tiene que dejar temporales de preview");
});

test("--check falla con codigo != 0 si la receta esta mal", () => {
  const receta = path.join(dir, "mala.json");
  fs.writeFileSync(receta, JSON.stringify({ formato: "21:9" }));
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${path.join(dir, "x.mp4")}`,
    `--receta=${receta}`, "--check"], { encoding: "utf8", env: SIN_GROQ });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /21:9/);
});

test("--formato invalido por CLI falla con mensaje claro, no con un TypeError crudo", () => {
  // La receta que carga cargarReceta es valida (formato por defecto), pero
  // --formato la pisa DESPUES de esa validacion. Sin revalidar, esto llegaba
  // crudo a construirGrafo y reventaba con "Cannot destructure property 'ancho'
  // of undefined" — un mensaje en ingles que no dice cual es el problema real.
  const salida = path.join(dir, "cli-formato-malo.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--formato=9x16"],
    { encoding: "utf8", env: SIN_GROQ });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /9x16/, "el mensaje tiene que nombrar el valor invalido");
  assert.doesNotMatch(r.stdout + r.stderr, /TypeError|Cannot destructure/, "no puede escaparse un stack trace crudo de JS");
  assert.equal(fs.existsSync(salida), false, "un formato invalido no puede terminar escribiendo un video");
});

test("--calidad invalida por CLI falla en vez de caer en silencio a 'rapido'", () => {
  // Antes: --calidad=turbo no rompia nada. receta.calidad === "max" ? "max" :
  // "rapido" convertia CUALQUIER valor no reconocido en "rapido" sin avisar.
  const salida = path.join(dir, "cli-calidad-mala.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--calidad=turbo"],
    { encoding: "utf8", env: SIN_GROQ });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /turbo/, "el mensaje tiene que nombrar el valor invalido");
  assert.equal(fs.existsSync(salida), false, "una calidad invalida no puede terminar escribiendo un video");
});

test("--preview con un clip mas corto que la ventana no revienta y se recorta al largo real", () => {
  // OJO: la ventana de preview mide 20s y este clip dura 8s, asi que la ventana
  // pedida (--preview=4) NO puede terminar siendo "corta" respecto del propio
  // clip: como mucho, puede cubrirlo entero. Afirmar "dur < 8" aca es una
  // premisa que no puede sostenerse (el clip mide 8s) — la verificacion real de
  // que la ventana efectivamente recorta un tramo corto vive en la prueba de
  // abajo con `clipLargo`, donde el video es mas largo que la ventana.
  const salida = path.join(dir, "prev.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--preview=4"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim());
  assert.ok(Math.abs(dur - 8) < 0.5, `la ventana no puede pasarse del largo real del clip (8s), dio ${dur}s`);
  assert.deepEqual(archivosResiduales(dir), [], "el recorte temporal de preview tiene que borrarse");
});

test("--preview arranca EXACTO en la ventana pedida, no en el keyframe mas cercano", () => {
  // Con un clip de 30s y --preview=15, la ventana pedida es 5s..25s (20s de ancho).
  // Si el recorte usara "-ss antes de -i" + "-c copy" a secas, el corte real
  // arrancaria en el keyframe mas cercano ANTES de 5s (pudiendo ser 0s), y la
  // duracion de salida se iria muy por encima de los 20s pedidos.
  const salida = path.join(dir, "prev-largo.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clipLargo}`, `--out=${salida}`, "--preview=15"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim());
  assert.ok(Math.abs(dur - 20) < 0.6, `la ventana de preview tendria que durar ~20s, dio ${dur}s`);
  assert.deepEqual(archivosResiduales(dir), [], "el recorte temporal de preview tiene que borrarse");
});

test("el reporte cuenta bien los efectos de camara dentro y fuera de la ventana de preview", () => {
  // clipLargo dura 30s. --preview=15 pide el centro en 15s, ventana de 20s
  // ancho: [5s, 25s). Dos movimientos caen ADENTRO (t=10, t=20) y dos caen
  // AFUERA (t=2, t=27). Si el filtro de la ventana tuviera un operando
  // cambiado o una comparacion invertida, este numero (no 0-0 como en las
  // otras pruebas de preview, que usan camara: []) lo delataria.
  const receta = path.join(dir, "ventana-camara.json");
  fs.writeFileSync(receta, JSON.stringify({
    camara: [
      { t: 2, fx: "jumpCutClose" },
      { t: 10, fx: "jumpCutClose" },
      { t: 20, fx: "jumpCutWide" },
      { t: 27, fx: "jumpCutClose" },
    ],
  }));
  const salida = path.join(dir, "ventana-camara.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clipLargo}`, `--out=${salida}`,
    `--receta=${receta}`, "--preview=15"], { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Efectos de camara aplicados:\s*2\b/, r.stdout);
  assert.match(r.stdout, /Fuera de la ventana de preview \(no se aplicaron\):\s*2\b/, r.stdout);
});

test("el temporal de preview se borra aunque el render falle DESPUES de crearse", () => {
  // Extension de salida invalida: el recorte de preview (el .mp4 temporal) se
  // crea bien, pero el render final (componer) tira porque ffmpeg no reconoce
  // el contenedor de salida. El finally tiene que borrar el temporal igual,
  // no solo cuando todo sale bien.
  const salida = path.join(dir, "prev-falla.xyz");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--preview=4"],
    { encoding: "utf8", timeout: 60000, env: SIN_GROQ });
  assert.notEqual(r.status, 0);
  assert.deepEqual(archivosResiduales(dir), [], "un render fallido despues del corte no puede dejar el temporal de preview");
});

test("render completo y reporte final", () => {
  const salida = path.join(dir, "full.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--formato=1:1"],
    { encoding: "utf8", timeout: 300000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(salida));
  assert.match(r.stdout, /encoder/i);
  assert.match(r.stdout, /segundos|tardo/i);
});

test("el reporte no confunde avisos de otras categorias con camara salteada", () => {
  // 1 movimiento de camara valido (t explicito) + 2 que cargarReceta va a saltear
  // porque buscan una palabra que no existe. El proceso hijo corre con SIN_GROQ (sin
  // GROQ_API_KEY) y sin --srt, asi que studio.mjs sigue sin transcribir y manda
  // palabras: [] a cargarReceta — por eso las dos busquedas por "palabra" fallan.
  // El reporte tiene que decir "1 aplicado" y separar esos 2 avisos de los que
  // sean de camara especificamente, sin mezclarlos bajo una sola etiqueta ambigua.
  const receta = path.join(dir, "avisos.json");
  fs.writeFileSync(receta, JSON.stringify({
    camara: [
      { t: 1, fx: "jumpCutClose" },
      { palabra: "estanoexisteseguro1", fx: "zoomIn" },
      { palabra: "estanoexisteseguro2", fx: "zoomIn" },
    ],
  }));
  const salida = path.join(dir, "reporte.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, `--receta=${receta}`],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Efectos de camara aplicados:\s*1\b/, r.stdout);
  assert.match(r.stdout, /avisos/i, r.stdout);
  // Ningun numero en el reporte de avisos totales puede ser menor a los 2 avisos
  // reales que genero cargarReceta (word not found x2) — eso seria conflacion silenciosa.
  const totalAvisos = (r.stdout.match(/Avisos totales[^:]*:\s*(\d+)/i) || [])[1];
  assert.ok(totalAvisos !== undefined, "el reporte tiene que declarar el total de avisos");
  assert.ok(Number(totalAvisos) >= 2, `el reporte subcuenta los avisos: dijo ${totalAvisos}`);
});

test("--sin-corte saltea el paso de cortar silencios y lo dice en el reporte", () => {
  const salida = path.join(dir, "sin-corte.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--sin-corte"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Corte:\s*salteado/i, r.stdout);
  assert.deepEqual(archivosResiduales(dir), [], "--sin-corte no tiene que dejar el temporal de corte");
});

test("sin GROQ_API_KEY y sin --srt, el pipeline sigue sin transcribir (no crashea) y lo dice", () => {
  // Este es EL caso que exige la brief: si no hay API key y no se dio un SRT ya
  // hecho, el render tiene que completarse igual, sin anclaje por palabra, y el
  // reporte tiene que decirlo en criollo — no fallar en silencio ni reventar.
  const salida = path.join(dir, "sin-groq.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--sin-corte"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /GROQ_API_KEY/, r.stdout);
  assert.match(r.stdout, /sin anclaje por palabra|sin transcribir/i, r.stdout);
  assert.ok(fs.existsSync(salida), "el render tiene que completarse igual, sin transcribir");
});

test("--srt con un archivo que no existe falla con un mensaje claro, no con un stack crudo", () => {
  const salida = path.join(dir, "srt-malo.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`,
    "--srt=" + path.join(dir, "no-existe.srt")], { encoding: "utf8", timeout: 30000, env: SIN_GROQ });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /no-existe\.srt/);
  assert.equal(fs.existsSync(salida), false);
});

// --- Task 10: wiring de --limpiar y --estabilizar (fuera del brief original de
// studio.mjs, pero siguiendo el mismo patron de --formato/--calidad de arriba). ---

test("sin --limpiar ni --estabilizar, el reporte los declara apagados", () => {
  const salida = path.join(dir, "sin-limpieza.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--sin-corte"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Limpieza:\s*no\.\s*Estabilizacion:\s*no\./i, r.stdout);
});

test("--limpiar invalido por CLI falla con mensaje claro, no en silencio", () => {
  const salida = path.join(dir, "cli-limpiar-malo.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--limpiar=medio", "--sin-corte"],
    { encoding: "utf8", env: SIN_GROQ });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /medio/, "el mensaje tiene que nombrar el valor invalido");
  assert.match(r.stdout + r.stderr, /suave.*normal.*fuerte|fuerte.*normal.*suave/i, "el mensaje tiene que listar los validos");
  assert.equal(fs.existsSync(salida), false, "un nivel de limpieza invalido no puede terminar escribiendo un video");
});

test("--limpiar=normal queda en el reporte y no deja temporales propios", () => {
  const salida = path.join(dir, "con-limpieza.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--limpiar=normal", "--sin-corte"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Limpieza:\s*normal\./i, r.stdout);
  assert.ok(fs.existsSync(salida));
  assert.deepEqual(archivosResiduales(dir), [], "la limpieza es un filtro en el grafo, no tiene que dejar temporales");
});

test("--estabilizar corre antes que todo lo demas, queda en el reporte y limpia su .trf", () => {
  const salida = path.join(dir, "estabilizado.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clipChico}`, `--out=${salida}`, "--estabilizar", "--sin-corte"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Estabilizacion:\s*aplicada/i, r.stdout);
  assert.match(r.stdout, /Limpieza:\s*no\.\s*Estabilizacion:\s*si\./i, r.stdout);
  assert.ok(fs.existsSync(salida));
  // OJO: el pipeline COMPLETO reformatea al formato de la receta (16:9 = 1920x1080
  // por default), asi que las dimensiones del archivo final NO tienen por que
  // coincidir con las del clip de entrada (480x270) — eso ya lo confirma
  // filtroDeFormato/construirGrafo, no es lo que esta prueba de wiring audita. Lo
  // que SI corresponde verificar aca es que la duracion no se rompio (estabilizar
  // trabaja sobre el archivo entero, sin recortar ni duplicar) y que no queda
  // basura de los pasos intermedios. La preservacion real de dimensiones por
  // `estabilizar()` ya se prueba de forma aislada en enhance.test.mjs.
  const datos = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout;
  assert.match(datos, /1920,1080/, "el formato 16:9 por default tiene que aplicarse igual con --estabilizar");
  const dur = Number(datos.trim().split("\n").pop());
  assert.ok(Math.abs(dur - 3) < 0.5, `la duracion del clip (3s) no puede cambiar de forma silenciosa, dio ${dur}s`);
  assert.deepEqual(archivosResiduales(dir), [],
    "ni el .studio-estab-*.mp4 intermedio ni el .trf de vidstab pueden sobrevivir al pipeline");
});

test("--limpiar y --estabilizar combinados: ambos quedan aplicados en el reporte", () => {
  const salida = path.join(dir, "combo.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clipChico}`, `--out=${salida}`,
    "--limpiar=suave", "--estabilizar", "--sin-corte"], { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Limpieza:\s*suave\.\s*Estabilizacion:\s*si\./i, r.stdout);
  assert.ok(fs.existsSync(salida));
  assert.deepEqual(archivosResiduales(dir), []);
});

// --- Fix round 1 de revision (findings 1-5) ---

test("--check avisa explicitamente que valido contra la duracion SIN CORTAR y sin transcribir", () => {
  // Finding 5: --check no puede sonar mas seguro de lo que es. Antes esto quedaba
  // implicito (nadie lo decia); ahora tiene que decirlo en criollo, dos veces
  // (duracion sin cortar, anclaje por palabra no resuelto).
  const salida = path.join(dir, "check-aviso.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--check"],
    { encoding: "utf8", env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SIN CORTAR/i, r.stdout);
  assert.match(r.stdout, /ORIGINAL/i, r.stdout);
  assert.match(r.stdout, /no se transcribio/i, r.stdout);
  assert.match(r.stdout, /anclado por PALABRA/i, r.stdout);
});

test("receta.corte se respeta: los parametros que aparecen en el reporte son los de la receta, no los defaults", () => {
  // Finding 3: un "corte": {...} en la receta no puede quedar escrito y ser ignorado.
  // Uso db/min/pad que no son los defaults (-30/0.6/0.15) para que la prueba solo
  // pueda pasar si esos 3 numeros de verdad viajaron hasta cortarSilencios.
  const receta = path.join(dir, "corte-custom.json");
  fs.writeFileSync(receta, JSON.stringify({ corte: { db: -25, min: 0.4, pad: 0.22 } }));
  const salida = path.join(dir, "corte-custom.mp4");
  // clipChico (no `clip`): asi la clave de cache de esta combinacion nunca choca con
  // la que ya haya generado otra prueba de arriba sobre `clip` con los params default.
  const r = spawnSync("node", [STUDIO, `--in=${clipChico}`, `--out=${salida}`, `--receta=${receta}`],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /db=-25/, r.stdout);
  assert.match(r.stdout, /min=0\.4s/, r.stdout);
  assert.match(r.stdout, /pad=0\.22s/, r.stdout);
});

test("el corte se cachea entre corridas: la 2da corrida con el mismo --in reusa el corte y lo dice", () => {
  // Finding 4: iterar con --preview sobre el mismo --in no puede recortar y transcribir
  // el video ENTERO cada vez. Clip propio (no compartido con otras pruebas) para que la
  // clave de cache de esta prueba sea inequivocamente "primera vez" en su 1ra corrida.
  const clipCache = crearClipDePrueba({ segundos: 3, ancho: 320, alto: 240, salida: path.join(dir, "cache-in.mp4") });
  const salida1 = path.join(dir, "cache-out-1.mp4");
  const salida2 = path.join(dir, "cache-out-2.mp4");

  const r1 = spawnSync("node", [STUDIO, `--in=${clipCache}`, `--out=${salida1}`],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r1.status, 0, r1.stderr);
  assert.doesNotMatch(r1.stdout, /reusando/i, "la primera corrida no puede decir que reusa nada (todavia no hay cache)");

  const r2 = spawnSync("node", [STUDIO, `--in=${clipCache}`, `--out=${salida2}`],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stdout, /Corte:.*reusando.*cache/i, r2.stdout);
  assert.ok(fs.existsSync(salida2), "reusar el cache del corte igual tiene que terminar en un video renderizado");
});

test("--rehacer ignora el cache y fuerza un corte nuevo", () => {
  const clipR = crearClipDePrueba({ segundos: 3, ancho: 320, alto: 240, salida: path.join(dir, "rehacer-in.mp4") });
  const salida1 = path.join(dir, "rehacer-out-1.mp4");
  const salida2 = path.join(dir, "rehacer-out-2.mp4");

  const r1 = spawnSync("node", [STUDIO, `--in=${clipR}`, `--out=${salida1}`],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r1.status, 0, r1.stderr);

  const r2 = spawnSync("node", [STUDIO, `--in=${clipR}`, `--out=${salida2}`, "--rehacer"],
    { encoding: "utf8", timeout: 180000, env: SIN_GROQ });
  assert.equal(r2.status, 0, r2.stderr);
  assert.doesNotMatch(r2.stdout, /reusando/i, "--rehacer no puede reusar el cache aunque exista");
});

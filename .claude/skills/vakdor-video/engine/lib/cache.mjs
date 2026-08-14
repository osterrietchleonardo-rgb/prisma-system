// lib/cache.mjs — Lock entre procesos basado en fs.mkdirSync (atomico: falla si el
// directorio ya existe) para que dos corridas de studio.mjs contra el mismo --in con
// los mismos parametros no hagan el trabajo caro (cortar silencios, o pegarle a la API
// de Groq) dos veces en paralelo. El proyecto corre varias terminales contra el mismo
// repo seguido (ver multi-terminal-worktrees en la memoria) — esto no es hipotetico.

import fs from "node:fs";

const TIEMPO_MAX_ESPERA_MS_DEFAULT = 15 * 60 * 1000; // 15 min: alcanza para un video largo real.
const INTERVALO_POLL_MS_DEFAULT = 1000;

/**
 * Ejecuta `hacer()` protegido por un lock de archivo entre procesos.
 *
 * `fs.mkdirSync` falla atomicamente (EEXIST) si el directorio ya existe: eso es lo que
 * hace que "quien gana el mkdir" sea una decision atomica entre procesos del sistema
 * operativo, sin libreria externa ni base de datos.
 *
 * `yaListo()` es un callback SINCRONICO que dice si el trabajo ya esta hecho (por
 * ejemplo, `() => fs.existsSync(archivoDeSalida)`). `hacer()` tiene que empezar
 * revisandolo TAMBIEN por su cuenta (doble chequeo): entre que un competidor publica
 * el resultado y que este proceso consigue el lock, puede haber pasado — sin ese
 * doble chequeo, el dueño del lock repetiria el trabajo igual.
 *
 * Un proceso que pierde la carrera por el lock espera a que `yaListo()` se vuelva
 * verdadero, sondeando cada `intervaloPollMs`. Si pasan `tiempoMaxEsperaMs` sin que el
 * dueño suelte el lock NI aparezca el resultado (crash, cuelgue, o una corrida mas
 * lenta de lo esperado), este proceso deja de esperar y hace el trabajo el mismo:
 * mejor un doble gasto ocasional que quedarse esperando para siempre a un proceso que
 * quizas ya no existe.
 */
export async function conLock(lockPath, yaListo, hacer, opciones = {}) {
  const tiempoMaxEsperaMs = opciones.tiempoMaxEsperaMs ?? TIEMPO_MAX_ESPERA_MS_DEFAULT;
  const intervaloPollMs = opciones.intervaloPollMs ?? INTERVALO_POLL_MS_DEFAULT;
  const inicio = Date.now();

  for (;;) {
    let soyElDueno = false;
    try {
      fs.mkdirSync(lockPath);
      soyElDueno = true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }

    if (soyElDueno) {
      try {
        return await hacer();
      } finally {
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
    }

    // Alguien mas tiene el lock. Si ya publico el resultado, `hacer()` lo va a ver
    // en su propio doble chequeo y no va a repetir el trabajo — no hace falta pelear
    // por el lock para eso.
    if (yaListo()) return await hacer();
    if (Date.now() - inicio > tiempoMaxEsperaMs) return await hacer();
    await new Promise((resolve) => setTimeout(resolve, intervaloPollMs));
  }
}

import { defineConfig, configDefaults } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    /**
     * `app/api/**` entra además de `lib/**`, y no es una comodidad.
     *
     * La regla que no se puede romper de la Etapa C —una plantilla con un solo
     * asesor en rojo NO pasa a `activa`— se decide en una función pura bien
     * testeada, pero el único lugar donde de verdad se APLICA es el endpoint.
     * Medido con mutaciones: dar vuelta esa línea en `route.ts` no ponía ni un
     * test en rojo de los 710, porque vitest no miraba `app/`. Lo único que
     * sostenía la regla era haberla probado a mano una vez.
     *
     * Los tests de endpoint se escriben con el cliente de base falso: no tocan
     * red ni Supabase.
     */
    include: ["lib/**/*.test.ts", "app/api/**/*.test.ts"],
    // Los tests del mapa están escritos para node:test, no para vitest, y los corre
    // el segundo tramo del script `test` (`node --test "lib/mapa/**/*.test.ts"`).
    // Sin esta exclusión vitest los barre igual y falla con "No test suite found".
    exclude: [...configDefaults.exclude, "lib/mapa/**"],
    environment: "node",
    /**
     * Margen para el arranque de los tests de endpoint, que NO es un arreglo de
     * algo reproducido — y conviene decirlo así.
     *
     * El `beforeAll` de esos tests importa la ruta entera y con eso arrastra
     * `docxtemplater`, `pizzip` y `mammoth`. Un implementador reportó haber
     * visto `Hook timed out in 10000ms` (el tope que vitest da por defecto) con
     * la caché de vite fría.
     *
     * **Lo intenté reproducir y no pude:** borrando `node_modules/.vite`, la
     * suite pasó entera SIN este cambio (1010 en verde, exit 0). Así que esto
     * es precaución, no una cura medida. Si alguien lo ve fallar, acá está el
     * lugar.
     *
     * Se sube el tope y no se precalienta en cada archivo porque el costo de
     * equivocarse es asimétrico: un rojo falso es más caro que una corrida
     * lenta. En esta etapa ya hubo uno (`confirmar-plantilla` fallaba 1 de cada
     * 5 corridas) y lo peligroso no fue el rojo — fue que enseñaba a descartar
     * los rojos de ese archivo.
     *
     * Los tests en sí siguen con el tope por defecto: esto es solo para hooks.
     */
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})

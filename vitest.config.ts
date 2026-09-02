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
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})

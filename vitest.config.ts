import { defineConfig, configDefaults } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
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

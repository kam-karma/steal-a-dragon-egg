import { defineConfig } from 'vitest/config'

// Balance runs are slow and print numbers; they are not part of `npx vitest run`.
export default defineConfig({
  test: { environment: 'node', include: ['balance/**/*.sim.ts'], testTimeout: 600_000 },
})

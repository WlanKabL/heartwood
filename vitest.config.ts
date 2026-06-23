import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Disable parallel file execution: Postgres integration tests share a single
    // database and must not race each other's truncate/seed cycles.
    fileParallelism: false,
  },
})

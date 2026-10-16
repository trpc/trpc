import * as Doctest from "@effect/doctest/Plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  root: import.meta.dirname,
  plugins: [Doctest.plugin()],
  test: {
    watch: false,
    include: [],
    includeSource: ["docs/typed.md", "docs/typed.mdx", "src/typed.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0
  }
})

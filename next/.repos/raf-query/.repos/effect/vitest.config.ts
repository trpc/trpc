import * as os from "node:os"
import * as path from "node:path"
import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config"

const isDeno = process.versions.deno !== undefined
const isBun = process.versions.bun !== undefined
const isNode = typeof process !== "undefined" &&
  process.release.name === "node" &&
  !isDeno &&
  !isBun
const integrationTestsEnabled = process.env.EFFECT_INTEGRATION_TESTS === "1"
const clusterTestsEnabled = process.env.EFFECT_CLUSTER_TESTS === "1"

const project = (
  name: string,
  directory: string,
  include: boolean = true,
  config: ViteUserConfig = {},
  projectExclude?: ReadonlyArray<string>,
  projectInclude?: ReadonlyArray<string>
) => {
  if (!include) {
    return []
  }

  const cfg = mergeConfig({
    root: directory,
    test: { name }
  }, config)

  const merged = mergeConfig(shared, cfg)
  if (projectExclude !== undefined) {
    merged.test!.exclude = [...projectExclude]
  }
  if (projectInclude !== undefined) {
    merged.test!.include = [...projectInclude]
  }
  return [merged]
}

export const exclude = [
  "**/.*/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/benchmark/**",
  "**/bundle/**",
  "**/typetest/**",
  "**/coverage/**",
  "**/test/utils/**",
  "**/test/cluster-integration/**",
  ...(!integrationTestsEnabled ? ["**/*.integration.test.{ts,tsx}"] : []),
  "**/*.d.ts",
  "**/*.config.*",
  "**/vitest.*"
]

const shared: ViteUserConfig = {
  optimizeDeps: {
    exclude: ["bun:sqlite"]
  },
  server: {
    watch: {
      ignored: exclude
    }
  },
  resolve: {
    tsconfigPaths: true
  },
  test: {
    exclude,
    passWithNoTests: true,
    setupFiles: [path.join(import.meta.dirname, "vitest.setup.ts")],
    sequence: {
      concurrent: true
    },
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["html"],
      reportsDirectory: "coverage",
      exclude
    }
  }
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      ...project(
        "effect",
        "packages/effect",
        true,
        {},
        isBun
          ? [
            ...exclude,
            // These tests assert Node-specific Web API or stack trace behavior.
            "test/reactivity/Atom.test.ts",
            "test/schema/Schema.test.ts",
            "test/schema/SchemaGetter.test.ts",
            "test/schema/toCodec.test.ts",
            "test/schema/toDifferJsonPatch.test.ts",
            "test/http/HttpEffect.test.ts",
            "test/http/HttpServerRequest.test.ts"
          ]
          : undefined
      ),
      ...project("@effect/ai-anthropic", "packages/ai/anthropic"),
      ...project("@effect/ai-cloudflare", "packages/ai/cloudflare"),
      ...project("@effect/ai-openai", "packages/ai/openai"),
      ...project("@effect/ai-typesafe", "packages/ai/typesafe"),
      ...project("@effect/ai-openai-compat", "packages/ai/openai-compat"),
      ...project("@effect/ai-openrouter", "packages/ai/openrouter"),
      ...project("@effect/atom-react", "packages/atom/react", true, {
        test: {
          environment: "jsdom",
          setupFiles: [path.join(import.meta.dirname, "packages/atom/react/vitest.setup.ts")]
        }
      }),
      ...project("@effect/atom-solid", "packages/atom/solid", true, {
        resolve: {
          conditions: ["browser"]
        },
        test: {
          environment: "jsdom",
          setupFiles: [path.join(import.meta.dirname, "packages/atom/solid/vitest.setup.ts")]
        }
      }),
      ...project("@effect/atom-vue", "packages/atom/vue", true, {
        test: {
          environment: "happy-dom"
        }
      }),
      ...project("@effect/opentelemetry", "packages/opentelemetry"),
      ...project("@effect/platform-browser", "packages/platform/browser", true, {
        test: {
          environment: "happy-dom",
          // Bun interprets Node's --localstorage-file value as a module path.
          execArgv: isBun
            ? []
            : [
              "--localstorage-file",
              path.resolve(os.tmpdir(), `vitest-${process.pid}.localstorage`)
            ],
          setupFiles: [path.join(import.meta.dirname, "packages/platform/browser/vitest.setup.ts")]
        }
      }),
      ...project("@effect/platform-bun", "packages/platform/bun", isBun),
      ...project("@effect/platform-deno", "packages/platform/deno", isDeno),
      ...project("@effect/platform-node", "packages/platform/node", isNode),
      ...project(
        "cluster-integration",
        "packages/platform/node",
        isNode && clusterTestsEnabled,
        {
          test: {
            globalSetup: [
              path.join(import.meta.dirname, "packages/platform/node/test/cluster-integration/globalSetup.ts")
            ],
            include: ["test/cluster-integration/**/*.test.ts"],
            retry: 0,
            sequence: {
              concurrent: false
            },
            testTimeout: 60_000
          }
        },
        exclude.filter((path) => path !== "**/test/cluster-integration/**"),
        [
          "test/cluster-integration/**/*.test.ts"
        ]
      ),
      ...project("@effect/platform-node-shared", "packages/platform/node-shared", isNode),
      ...project("@effect/vitest", "packages/vitest"),
      ...project("@effect/sql-clickhouse", "packages/sql/clickhouse"),
      ...project("@effect/sql-d1", "packages/sql/d1", !isDeno),
      ...project("@effect/sql-libsql", "packages/sql/libsql"),
      ...project("@effect/sql-mssql", "packages/sql/mssql"),
      // MySQL starts a fresh container per integration test suite, so avoid competing
      // with the other container-backed projects on integration-test runners.
      ...project(
        "@effect/sql-mysql2",
        "packages/sql/mysql2",
        true,
        integrationTestsEnabled
          ? {
            test: {
              fileParallelism: false,
              sequence: {
                groupOrder: 1
              }
            }
          }
          : {}
      ),
      ...project("@effect/sql-pg", "packages/sql/pg"),
      ...project("@effect/sql-pglite", "packages/sql/pglite"),
      ...project("@effect/sql-sqlite-bun", "packages/sql/sqlite-bun"),
      ...project(
        "@effect/sql-sqlite-do",
        "packages/sql/sqlite-do",
        true,
        {},
        // Miniflare needs Node/Bun; keep the in-process client tests on Deno.
        isDeno ? [...exclude, "test/Miniflare.test.ts"] : undefined
      ),
      ...project("@effect/sql-sqlite-node", "packages/sql/sqlite-node", isNode),
      ...project("@effect/sql-sqlite-react-native", "packages/sql/sqlite-react-native"),
      ...project("@effect/sql-sqlite-wasm", "packages/sql/sqlite-wasm"),
      ...project("@effect/ai-codegen", "packages/tools/ai-codegen", isNode),
      ...project("@effect/api-diff", "packages/tools/api-diff"),
      ...project("@effect/bundle", "packages/tools/bundle"),
      ...project("@effect/doctest", "packages/tools/doctest"),
      ...project("@effect/docgen", "packages/tools/docgen"),
      ...project("@effect/jsdocs", "packages/tools/jsdocs"),
      ...project("@effect/openapi-generator", "packages/tools/openapi-generator"),
      ...project("@effect/utils", "packages/tools/utils", isNode),
      ...project("@effect/oxc", "packages/tools/oxc")
    ]
  }
})

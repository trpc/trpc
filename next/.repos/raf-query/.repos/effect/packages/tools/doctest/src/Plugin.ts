/**
 * @since 4.0.0
 */

import { normalizePath, type Plugin, transformWithOxc } from "vite"
import type { TestUserConfig } from "vitest/config"
import * as Protocol from "./Protocol.ts"
import * as Source from "./Source.ts"
import { transform } from "./Transform.ts"

const runner = "@effect/doctest/Runner"

const collectorModule = (
  file: string,
  snippets: ReadonlyArray<Source.Snippet>,
  version?: string | undefined
): string => {
  const tests = snippets.map((snippet, index) => {
    const id = JSON.stringify(Protocol.snippetId(file, index, version))
    const label = JSON.stringify(snippet.name ?? `line ${snippet.line}`)
    return `test(${label}, () => import(${id}))`
  })

  return `import { test } from "@effect/doctest/Runtime"\n\n${tests.join("\n\n")}\n`
}

/**
 * Creates a Vite plugin that transforms marked documentation snippets into Vitest tests.
 *
 * **Details**
 *
 * Use Vitest's `includeSource` option to discover files containing `import.meta.vitest`. The plugin collects marked files through a collector module without executing the source module. Every snippet executes in its own module, with imports resolved relative to the original source file. Native in-source tests are not supported.
 *
 * @category testing
 * @since 4.0.0
 */
export const plugin = (): Plugin => {
  const store = new Map<string, ReadonlyArray<Source.Snippet>>()
  const cache = new Map<string, {
    readonly version: string | undefined
    readonly value: Promise<ReadonlyArray<Source.Snippet>>
  }>()

  const loadExamples = (
    file: string,
    version?: string | undefined
  ): Promise<ReadonlyArray<Source.Snippet>> => {
    const cached = cache.get(file)
    if (cached !== undefined && cached.version === version) {
      return cached.value
    }

    const loaded = Source.extractFile(file).then((snippets) => {
      store.set(file, snippets)
      return snippets
    })

    cache.set(file, { version, value: loaded })
    return loaded
  }

  return {
    name: "effect-doctest",
    enforce: "pre",
    perEnvironmentWatchChangeDuringDev: true,
    config(config) {
      if (config.test?.runner !== undefined) {
        return undefined
      }

      return { test: { runner } satisfies TestUserConfig }
    },
    resolveId(source, importer, options) {
      const collector = Protocol.request(Protocol.collectorPrefix, source)
      if (collector !== undefined) {
        return Protocol.resolvedId("collector", collector)
      }

      const snippet = Protocol.request(Protocol.snippetPrefix, source)
      if (snippet !== undefined && store.has(snippet.file)) {
        return Protocol.resolvedId("snippet", snippet)
      }

      const parent = importer === undefined ? undefined : Protocol.resolvedRequest(importer)
      if (parent?.kind !== "snippet") {
        return null
      }

      return this.resolve(source, parent.file, { ...options, skipSelf: true })
    },
    load(id) {
      const loaded = Protocol.resolvedRequest(id)
      if (loaded === undefined) {
        return null
      }

      this.addWatchFile(loaded.file)
      return loadExamples(loaded.file, loaded.version).then(async (snippets) => {
        if (loaded.kind === "collector") {
          return collectorModule(loaded.file, snippets, loaded.version)
        }

        const snippet = loaded.index === undefined ? undefined : snippets[loaded.index]
        if (snippet === undefined) {
          throw new Error(`Unknown documentation snippet module '${id}'`)
        }

        const source = transform(snippet.source, loaded.file, snippet.line)
        if (Source.isMarkdown(loaded.file)) {
          // Seed the source map with the snippet's document offset. Oxc removes
          // these blank lines from the emitted code but preserves their mapping.
          return transformWithOxc("\n".repeat(snippet.line) + source, loaded.file, { lang: "ts" })
        }
        return source
      })
    },
    watchChange(id) {
      const normalized = normalizePath(id)
      for (const file of store.keys()) {
        if (normalizePath(file) === normalized) {
          cache.delete(file)
        }
      }
    }
  }
}

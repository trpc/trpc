# Rsbuild Import Protection - Adapter Internals

## Scope

This document covers the Rsbuild-specific orchestration around the shared
import-protection core in `src/import-protection/INTERNALS.md`.

Rsbuild owns:

- post-transform enforcement through a Rspack post-loader
- virtual-module transport through `VirtualModulesPlugin`
- compilation-truth reporting in `processAssets`
- final graph reconstruction from Rspack compilation data

Shared transform-time AST analysis, rewrite logic, source extraction, usage
lookup, source locations, trace formatting, and mock code generation are
described in the shared internals doc.

## Mental Model

Vite is primarily `resolveId`-driven. Rsbuild is primarily `transform` +
`processAssets`-driven.

That difference explains most of the adapter divergence.

Rsbuild does not emulate the Vite pending-queue state machine. It relies more
directly on post-transform code and final compilation truth.

## Native Hook Shape

Import protection is attached through Rsbuild hooks, not a dedicated mini-plugin
object:

1. `onBeforeBuild`
2. `onBeforeDevCompile`
3. `modifyRspackConfig`
4. `processAssets(..., { stage: 'report' })`

`modifyRspackConfig` installs both the virtual-modules plugin and the
environment-scoped import-protection post-loader.

## State Model

Per environment, Rsbuild keeps a smaller runtime state than Vite:

- `resolveCache`
- `seenViolations`

Shared adapter state contains:

- `virtualModules`
- `vmPlugins`
- `readyVmPlugins`
- `pendingWrites`

Notably absent compared to Vite:

- no `pendingViolations`
- no `postTransformImports`
- no broad `deferredBuildViolations`
- no resolve-time dev reachability pipeline

## Transform Phase

Rsbuild enforcement runs after the Start compiler in a Rspack loader with
`enforce: 'post'`. The complete transform pipeline lives in
`import-protection-loader.ts`; mutable configuration and per-environment state
are passed through loader options.

That matters because many compiler-safe imports are already stripped by the time
import protection runs. This naturally suppresses a large class of false
positives without a Vite-style pending verification pass.

The transform phase is responsible for:

- self-denial for forbidden files
- self-denial for marker-protected files in the wrong environment
- persisting detected marker metadata in Rspack `module.buildInfo`
- direct specifier rewrites to mock-edge modules

The transform treats the code it receives as authoritative. It does not read,
parse, or analyze original source. Imports removed by the Start compiler are no
longer part of this phase; imports with unsafe client/server usage remain in the
transformed code and are checked normally.

## Virtual Module Transport

Rsbuild reuses the shared mock generators, but not the Vite id transport.

Instead it writes environment-scoped virtual files under:

```text
<root>/node_modules/.virtual/import-protection/<env>/
```

The important forms are:

- `mock-silent.mjs`
- `mock-runtime-<base64>.mjs`
- `mock-edge-<base64>.mjs`

Writes may happen before the `VirtualModulesPlugin` instance is ready, so the
adapter queues them and flushes during compilation setup.

## Reporting Phase

`processAssets({ stage: 'report' })` is the authoritative reporting step.

It reconstructs the final view of the compilation from Rspack data by:

1. snapshotting each module and its outgoing connections
2. collecting specifier and file violations plus possible marker modules
3. deduplicating marker modules and validating their persisted metadata
4. returning early when no violations remain
5. building the `ImportGraph` and diagnostic indexes only when needed

Each `RspackModuleGraphNode` stores a module and its imported modules. Missing and
errored target modules are skipped.
Connections are not filtered by `getActiveState()` because inactive connections
can still carry diagnostic evidence. Duplicate connections to the same target
module collapse to one.

Snapshotting does not apply source-file eligibility. Intermediate modules remain
available for entry-to-violation traces, while the scanner applies importer and
rule checks. Normalized resource ids are used for rules, traces, and diagnostics;
`resourceResolveData.path` is preferred for original-source lookup.

When violations exist, the adapter replays the snapshot to build `ImportGraph`;
it does not query outgoing connections again. A clean compilation avoids entry
traversal, graph indexes, and module-source loading.

Diagnostic enrichment is lazy. The transform-result provider reads
`module.originalSource().sourceAndMap()` when available. It gets original code
from sourcemap `sourcesContent`, then falls back to
`compilation.inputFileSystem.readFile()`. Results and in-flight reads are cached
per module.

Importer locations use this order:

1. find unsafe usage in original code
2. find unsafe usage in compiled code
3. find the import statement in compiled, then original code

Trace edges search compiled import statements. The adapter does not use
`dependency.loc`, which may identify a transformed declaration rather than the
actual import usage.

This is the core Rsbuild-native replacement for Vite's `generateBundle`
verification plus dev pending-violation flow.

## Source And Compilation APIs

The Rsbuild adapter intentionally prefers native Rspack APIs where possible.

Transform-time:

- `loaderContext.resource`
- `loaderContext.resourcePath`
- `loaderContext.context`
- `loaderContext.resolve(...)`
- `loaderContext._module.buildInfo`

`_module` is a deprecated Rspack loader-context API. It is used deliberately
because a loader invocation is bound to one exact module instance, including
its layer. Keying modules by resource would collapse distinct modules that use
the same resource in different layers. Do not add a resource-map fallback.

Compilation-time:

- `module.resourceResolveData?.resource`
- `module.resourceResolveData?.path`
- `module.identifier()` (normalized fallback)
- `module.buildInfo`
- `module.originalSource().sourceAndMap()` (confirmed diagnostics only)
- sourcemap `sourcesContent`
- `compilation.inputFileSystem.readFile()` (original-source fallback)
- `moduleGraph.getOutgoingConnectionsInOrder(module)`
- `connection.dependency.request`

## Marker Handling

Unlike Vite, Rsbuild does not introduce plugin-owned virtual marker modules for
normal operation.

The real package marker files are source-level markers. The post-loader writes
`{ kind, source }` directly to its current `_module.buildInfo` before replacing
a wrong-environment module. The metadata therefore stays attached to the exact
resource-and-layer module and survives self-denial mocking and persistent-cache
restores.

`processAssets` treats non-excluded, non-file-denied imports as possible marker
modules, then checks their `buildInfo`. It does not infer marker kind from final
dependency requests.

## Practical Maintainer Rule

When changing Rsbuild import protection, ask:

1. Can the change be expressed in shared analysis/rewrite/mock codegen instead?
2. If it is adapter-specific, is it really about post-transform enforcement,
   virtual-file transport, or compilation-time reporting?
3. Can final compilation truth answer the question more simply than adding a new
   pending state machine?

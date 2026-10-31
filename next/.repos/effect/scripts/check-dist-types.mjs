// Type-checks the built `effect` declarations the way a consumer with
// `skipLibCheck: false` does. Run after `pnpm build` with `stripInternal`
// enabled to catch public declarations that reference `@internal` symbols
// (see Effect-TS/effect#6431, #7187, #8161).
import { execFileSync } from "node:child_process"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"
import { fileURLToPath } from "node:url"

const root = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..")
const pkgDir = Path.join(root, "packages", "effect")
const dist = Path.join(pkgDir, "dist")

if (!Fs.existsSync(Path.join(dist, "index.d.ts"))) {
  console.error("packages/effect/dist is missing; run `pnpm build` first")
  process.exit(1)
}

const pkg = JSON.parse(Fs.readFileSync(Path.join(pkgDir, "package.json"), "utf8"))
const entrypoints = Object.entries(pkg.publishConfig.exports)
  .filter(([key, target]) => target !== null && key !== "./package.json" && !key.includes("*"))
  .map(([key, target]) => [Path.posix.join(pkg.name, key), [Path.join(pkgDir, target.replace(/\.js$/, ".d.ts"))]])

const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "effect-dist-types-"))
try {
  Fs.writeFileSync(
    Path.join(dir, "index.ts"),
    entrypoints.map(([entry], i) => `import * as _${i} from "${entry}"\nexport { _${i} }\n`).join("")
  )
  const config = {
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      skipLibCheck: false,
      types: ["node"],
      typeRoots: [Path.join(root, "node_modules", "@types")],
      paths: {
        ...Object.fromEntries(entrypoints),
        [`${pkg.name}/*`]: [Path.join(dist, "*")]
      }
    },
    files: ["index.ts"]
  }
  Fs.writeFileSync(Path.join(dir, "tsconfig.json"), JSON.stringify(config))
  execFileSync("pnpm", ["exec", "tsc", "-p", Path.join(dir, "tsconfig.json")], { cwd: root, stdio: "inherit" })

  // Core, crypto and JOSE imports must work without DOM types (see Effect-TS/effect#10115).
  Fs.writeFileSync(
    Path.join(dir, "index.ts"),
    ["effect", "effect/Effect", "effect/Schema", "effect/crypto/KeyFormat", "effect/jose"]
      .map((entry, i) => `import * as _${i} from "${entry}"\nexport { _${i} }\n`).join("")
  )
  config.compilerOptions.lib = ["ES2024"]
  config.compilerOptions.exactOptionalPropertyTypes = true
  Fs.writeFileSync(Path.join(dir, "tsconfig.json"), JSON.stringify(config))
  execFileSync("pnpm", ["exec", "tsc", "-p", Path.join(dir, "tsconfig.json")], { cwd: root, stdio: "inherit" })

  // Even a single subpath import must work without Node ambient types or
  // an explicit ESNext.Disposable library (see Effect-TS/effect#9314).
  Fs.writeFileSync(Path.join(dir, "index.ts"), 'export * from "effect/Option"\n')
  config.compilerOptions.types = []
  config.compilerOptions.lib = ["ES2022", "DOM", "DOM.Iterable"]
  Fs.writeFileSync(Path.join(dir, "tsconfig.json"), JSON.stringify(config))
  execFileSync("pnpm", ["exec", "tsc", "-p", Path.join(dir, "tsconfig.json")], { cwd: root, stdio: "inherit" })
} catch (error) {
  process.exitCode = typeof error.status === "number" ? error.status : 1
} finally {
  Fs.rmSync(dir, { recursive: true, force: true })
}

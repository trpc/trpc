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
  .map(([key]) => Path.posix.join(pkg.name, key))

const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "effect-dist-types-"))
try {
  Fs.writeFileSync(
    Path.join(dir, "index.ts"),
    entrypoints.map((entry, i) => `import * as _${i} from "${entry}"\nexport { _${i} }\n`).join("")
  )
  Fs.writeFileSync(
    Path.join(dir, "tsconfig.json"),
    JSON.stringify({
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
          [pkg.name]: [Path.join(dist, "index.d.ts")],
          [`${pkg.name}/*`]: [Path.join(dist, "*")]
        }
      },
      files: ["index.ts"]
    })
  )
  execFileSync("pnpm", ["exec", "tsc", "-p", Path.join(dir, "tsconfig.json")], { cwd: root, stdio: "inherit" })
} catch (error) {
  process.exitCode = typeof error.status === "number" ? error.status : 1
} finally {
  Fs.rmSync(dir, { recursive: true, force: true })
}

import fs from 'fs'
import path from 'node:path'
import { globSync } from 'node:fs'
import { execSync } from 'node:child_process'

const rootDir = path.join(import.meta.dirname, '..')

const packagesDir = path.join(rootDir, 'packages')
const workspacePackageRanges = Object.fromEntries(
  globSync('*/package.json', { cwd: packagesDir }).map((p) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packagesDir, p), 'utf-8'))
    return [pkg.name, `^${pkg.version}`]
  }),
)

const catalog = JSON.parse(
  execSync('pnpm config get catalog --json', {
    cwd: rootDir,
    encoding: 'utf-8',
  }),
)
const catalogDependencies = ['@tanstack/react-query', 'redaxios', 'vitest']
const catalogPackageRanges = Object.fromEntries(
  catalogDependencies.map((name) => {
    const range = catalog[name]
    if (!range) {
      throw new Error(`Missing catalog entry for ${name}`)
    }
    return [name, range]
  }),
)
const exampleDependencyRanges = {
  ...workspacePackageRanges,
  ...catalogPackageRanges,
}

const examplesDir = path.join(rootDir, 'examples')
const examplePkgPaths = globSync('**/package.json', {
  cwd: examplesDir,
  exclude: (p) => p.includes('node_modules'),
})

let updatedCount = 0

for (const relPath of examplePkgPaths) {
  const fullPath = path.join(examplesDir, relPath)
  const content = fs.readFileSync(fullPath, 'utf-8')
  const pkg = JSON.parse(content)

  let changed = false
  for (const depType of ['dependencies', 'devDependencies']) {
    const deps = pkg[depType]
    if (!deps) {
      continue
    }
    for (const [name, range] of Object.entries(deps)) {
      const expectedRange = exampleDependencyRanges[name]
      if (expectedRange && range !== expectedRange) {
        deps[name] = expectedRange
        changed = true
      }
    }
  }

  if (changed) {
    fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n')
    updatedCount++
    console.log(`Updated ${relPath}`)
  }
}

console.log(`\nDone. Updated ${updatedCount} example(s).`)

/**
 * A package's `build` script: `vp pack` over every `exports` entry, as
 * unbundled ESM with declarations in `dist/`. In the workspace, `exports`
 * point at `src/`; `publishConfig.exports` points at the build output and
 * must list the same subpaths. Run from the package directory.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Conditions to files; `types` and `default` are required. */
type Entry = Readonly<Record<string, string>> & {
  readonly types: string;
  readonly default: string;
};
interface PackageJson {
  readonly name: string;
  readonly exports: Record<string, Entry>;
  readonly publishConfig?: { readonly exports?: Record<string, Entry> };
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;
const built = (condition: string, source: string) =>
  source
    .replace(/^\.\/src\//, './dist/')
    .replace(/\.ts$/, condition === 'types' ? '.d.ts' : '.js');

const published = pkg.publishConfig?.exports ?? {};
for (const [subpath, entry] of Object.entries(pkg.exports)) {
  const expected = Object.fromEntries(
    Object.entries(entry).map(([condition, file]) => [
      condition,
      built(condition, file),
    ]),
  );
  if (JSON.stringify(published[subpath]) !== JSON.stringify(expected)) {
    console.error(
      `${pkg.name}: publishConfig.exports["${subpath}"] must be ${JSON.stringify(expected)}`,
    );
    process.exit(1);
  }
}
for (const subpath of Object.keys(published)) {
  if (!(subpath in pkg.exports)) {
    console.error(
      `${pkg.name}: publishConfig.exports["${subpath}"] is not in exports`,
    );
    process.exit(1);
  }
}

const result = spawnSync(
  'vp',
  [
    'pack',
    '--no-config',
    ...Object.values(pkg.exports).map((entry) => entry.default),
    '--dts',
    '--unbundle',
    '--platform',
    'neutral',
    '--logLevel',
    'warn',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);

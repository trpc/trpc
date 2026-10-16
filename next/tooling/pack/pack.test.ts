import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, expect, test } from 'vite-plus/test';

const packages = new URL('../../packages/', import.meta.url);
const names = readdirSync(packages);

interface PackageJson {
  name: string;
  exports: Record<string, { default: string }>;
  publishConfig: {
    exports: Record<string, { types: string; default: string }>;
  };
}
const read = (name: string): PackageJson =>
  JSON.parse(readFileSync(new URL(`${name}/package.json`, packages), 'utf8'));

beforeAll(() => {
  const build = spawnSync(
    'pnpm',
    ['-r', '--filter', './packages/*', 'run', 'build'],
    {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
    },
  );
  expect(build.status, build.stdout + build.stderr).toBe(0);
}, 120_000);

const entries = names.flatMap((name) =>
  Object.keys(read(name).exports).map((subpath) => [name, subpath] as const),
);

test.each(entries)(
  '%s %s: the published entry exports what the source does',
  async (name, subpath) => {
    const pkg = read(name);
    const source = await import(
      new URL(`${name}/${pkg.exports[subpath]!.default}`, packages).href
    );
    const published = pkg.publishConfig.exports[subpath]!;
    const built = await import(
      new URL(`${name}/${published.default}`, packages).href
    );
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort());
    const types = readFileSync(
      new URL(`${name}/${published.types}`, packages),
      'utf8',
    );
    expect(types).not.toMatch(/^(import|export)\b.*from ['"][^'"]+\.ts['"]/m);
  },
);

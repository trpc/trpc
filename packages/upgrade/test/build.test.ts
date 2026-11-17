import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import j from 'jscodeshift';
import { build } from 'tsdown';

// Regression: `npx @trpc/upgrade` crashed on Node 22, which can't parse `using`
test('the build runs on Node 20 and 22', { timeout: 60_000 }, async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'trpc-upgrade-build-'));
  try {
    await build({
      config: join(import.meta.dirname, '../tsdown.config.ts'),
      outDir,
      logLevel: 'silent',
    });
    const files = readdirSync(outDir, {
      recursive: true,
      encoding: 'utf8',
    }).filter((file) => /\.[cm]?js$/.test(file));
    expect(files).toContain('bin.mjs');
    for (const file of files) {
      const declarations = j
        .withParser('babel')(readFileSync(join(outDir, file), 'utf8'))
        .find(j.VariableDeclaration)
        .filter((p) => p.node.kind.endsWith('using'));
      expect(declarations.length, file).toBe(0);
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

// Usage (from next/spikes): node client-bundle/anatomy.ts <entry.ts> [--json out.json] [--top 60] [--cuts sse,batch]
//
// Breaks one client bundle down by module, bundled like `pnpm bench budget`
// (rolldown 1.2.13, ESM, browser, tree-shaken, NODE_ENV=production):
// - total: the real minified bundle, gzip -9.
// - per module: its rendered (tree-shaken) code minified on its own; its gzip
//   share is the bundle's gzip split by minified size. Minifying modules one
//   at a time can't rename across them, so the shares are estimates; they
//   add up to the real total.
// - chain: the shortest static import path from the entry that stays on
//   modules with rendered code, so it names the code that keeps the module.
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { rolldown, type OutputChunk, type Plugin } from 'rolldown';
import { minifySync } from 'rolldown/utils';
import { patching } from './patches.ts';

const args = process.argv.slice(2);
const entry = args[0];
if (!entry)
  throw new Error('usage: anatomy.ts <entry.ts> [--json out] [--top n]');
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const top = Number(flag('--top') ?? 60);
const cut = patching(flag('--cuts')?.split(',') ?? []);

interface Info {
  imported: string[];
  isEntry: boolean;
}
const graph = new Map<string, Info>();
const collect: Plugin = {
  name: 'collect-graph',
  buildEnd() {
    for (const id of this.getModuleIds()) {
      const info = this.getModuleInfo(id);
      if (!info) continue;
      graph.set(id, {
        imported: [...info.importedIds, ...info.dynamicallyImportedIds],
        isEntry: info.isEntry,
      });
    }
  },
};

const build = async (minify: boolean) => {
  const b = await rolldown({
    input: entry,
    platform: 'browser',
    treeshake: true,
    logLevel: 'silent',
    transform: { define: { 'process.env.NODE_ENV': '"production"' } },
    plugins: minify ? [cut] : [cut, collect],
  });
  try {
    const { output } = await b.generate({ format: 'esm', minify });
    return output.filter((o): o is OutputChunk => o.type === 'chunk');
  } finally {
    await b.close();
  }
};

/** `effect/Stream`, `trpc client/links/http.ts`, `@orpc/client …`. */
export const label = (id: string) => {
  const pnpm =
    /node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)\/(.*)$/.exec(
      id,
    );
  if (pnpm) {
    const [, pkg, rest] = pnpm;
    const file = rest!
      .replace(/^(dist\/(esm\/|cjs\/)?|src\/)/, '')
      .replace(/\.(m?js|ts)$/, '');
    return `${pkg} ${file}`;
  }
  const trpc = /packages\/trpc\/src\/(.*)$/.exec(id);
  if (trpc) return `trpc ${trpc[1]}`;
  return id.replace(/^.*\/next\//, '');
};

const minified = await build(true);
const totalMin = minified.reduce((n, c) => n + c.code.length, 0);
const totalGzip = gzipSync(minified.map((c) => c.code).join(''), {
  level: 9,
}).length;

const chunks = await build(false);
const rows: { id: string; label: string; rendered: number; min: number }[] = [];
for (const chunk of chunks) {
  for (const [id, m] of Object.entries(chunk.modules)) {
    if (!m.code || m.renderedLength === 0) continue;
    let min = m.code.length;
    try {
      min = minifySync(`${label(id)}.js`, m.code, {
        compress: true,
        mangle: false,
      }).code.length;
    } catch {
      // A module that doesn't minify on its own keeps its unminified size.
    }
    rows.push({ id, label: label(id), rendered: m.renderedLength, min });
  }
}
const sumMin = rows.reduce((n, r) => n + r.min, 0);
const rendered = new Set(rows.map((r) => r.id));

const entries = [...graph].filter(([, i]) => i.isEntry).map(([id]) => id);
const bfs = (allowed: (id: string) => boolean) => {
  const parent = new Map<string, string | null>(entries.map((e) => [e, null]));
  const queue = [...entries];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of graph.get(id)?.imported ?? []) {
      if (parent.has(next) || !allowed(next)) continue;
      parent.set(next, id);
      queue.push(next);
    }
  }
  return parent;
};
const viaRendered = bfs((id) => rendered.has(id));
const viaAll = bfs(() => true);
const chainOf = (id: string) => {
  const parent = viaRendered.has(id) ? viaRendered : viaAll;
  const path: string[] = [];
  for (let at: string | null | undefined = id; at; at = parent.get(at))
    path.unshift(label(at));
  return path.slice(1);
};

const importers = new Map<string, string[]>();
for (const [id, info] of graph) {
  if (!rendered.has(id)) continue;
  for (const next of info.imported)
    importers.set(next, [...(importers.get(next) ?? []), label(id)]);
}

const result = rows
  .map((r) => ({
    ...r,
    gzip: Math.round((r.min / sumMin) * totalGzip),
    chain: chainOf(r.id),
    /** Direct importers that render code themselves. */
    importers: importers.get(r.id) ?? [],
  }))
  .sort((a, b) => b.gzip - a.gzip);

const byPackage = new Map<string, number>();
for (const r of result) {
  const pkg = r.label.startsWith('trpc ')
    ? `trpc ${r.label.split(' ')[1]!.split('/').slice(0, -1).join('/') || '.'}`
    : r.label.split(' ')[0]!;
  byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + r.gzip);
}

const kb = (n: number) => `${(n / 1000).toFixed(2)} kB`;
console.log(
  `${entry}\ntotal: ${kb(totalMin)} min, ${kb(totalGzip)} gzip, ${result.length} modules with code\n`,
);
console.log('by area (gzip share):');
for (const [pkg, n] of [...byPackage].sort((a, b) => b[1] - a[1]))
  console.log(`  ${kb(n).padStart(9)}  ${pkg}`);
console.log(
  `\ntop ${top} modules (gzip share, min alone, chain from the entry):`,
);
for (const r of result.slice(0, top)) {
  console.log(
    `  ${kb(r.gzip).padStart(9)} ${kb(r.min).padStart(9)}  ${r.label}`,
  );
  console.log(
    `             <- ${r.chain.slice(0, -1).reverse().slice(0, 4).join(' <- ')}`,
  );
}
const out = flag('--json');
if (out)
  writeFileSync(
    out,
    JSON.stringify({ entry, totalMin, totalGzip, modules: result }, null, 2),
  );

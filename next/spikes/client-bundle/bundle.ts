// The bundling `pnpm bench budget` does (rolldown 1.2.13, ESM, browser,
// tree-shaken, minified, NODE_ENV=production, gzip -9), for an entry file
// or for inline entry source.
import { gzipSync } from 'node:zlib';
import { rolldown, type Plugin } from 'rolldown';

const VIRTUAL = '\0client-bundle-entry';

export interface Size {
  readonly min: number;
  readonly gzip: number;
  readonly code: string;
}

export const measure = async (
  entry: { readonly file: string } | { readonly source: string },
  plugins: Plugin[] = [],
): Promise<Size> => {
  const virtual: Plugin = {
    name: 'virtual-entry',
    resolveId: (id) => (id === VIRTUAL ? id : undefined),
    load: (id) =>
      id === VIRTUAL && 'source' in entry
        ? { code: entry.source, moduleType: 'ts' }
        : undefined,
  };
  const build = await rolldown({
    input: 'file' in entry ? entry.file : VIRTUAL,
    platform: 'browser',
    treeshake: true,
    logLevel: 'silent',
    transform: { define: { 'process.env.NODE_ENV': '"production"' } },
    plugins: [virtual, ...plugins],
  });
  try {
    const { output } = await build.generate({ format: 'esm', minify: true });
    const code = output.map((o) => (o.type === 'chunk' ? o.code : '')).join('');
    return {
      min: code.length,
      gzip: gzipSync(code, { level: 9 }).length,
      code,
    };
  } finally {
    await build.close();
  }
};

export const kb = (n: number): string => `${(n / 1000).toFixed(1)} kB`;

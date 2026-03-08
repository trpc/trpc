/**
 * Generates hey-api SDK clients from all router files in test/routers/.
 * Used by both vitest globalSetup and the postinstall script.
 *
 * Convention: each router file `fooBar.ts` must export a router named `FooBar`
 * (filename stem with first letter uppercased). The generated hey-api client
 * is output to `fooBar-heyapi/` alongside the source file.
 */
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import { generateOpenAPIDocument } from '../../src/generate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routersDir = path.resolve(__dirname, '..', 'routers');

function getExportName(stem: string): string {
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export async function codegen() {
  const routerFiles = readdirSync(routersDir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.d.ts'),
  );

  for (const file of routerFiles) {
    const stem = path.basename(file, '.ts');
    const exportName = getExportName(stem);
    const routerPath = path.resolve(routersDir, file);
    const outputDir = path.resolve(routersDir, `${stem}-heyapi`);

    rmSync(outputDir, { recursive: true, force: true });

    const doc = await generateOpenAPIDocument(routerPath, { exportName });
    writeFileSync(
      path.resolve(routersDir, `${stem}.ts.json`),
      JSON.stringify(doc, null, 2) + '\n',
    );

    await createClient({
      input: doc as any,
      output: outputDir,
      plugins: [
        '@hey-api/typescript',
        {
          name: '@hey-api/sdk',
          operations: { strategy: 'single' },
        },
        { name: '@hey-api/client-fetch' },
        {
          dates: true,
          bigInt: true,
          name: '@hey-api/transformers',
        },
      ],
      logs: { level: 'error' },
    });
  }
}

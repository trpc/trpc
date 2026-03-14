/**
 * Generates a hey-api SDK client from the server's appRouter.
 *
 * Run with: pnpm codegen
 */
import { rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import { generateOpenAPIDocument } from '@trpc/openapi';
import { createTRPCHeyApiTypeResolvers } from '@trpc/openapi/heyapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routerPath = path.resolve(__dirname, '..', 'server', 'index.ts');
const outputDir = path.resolve(__dirname, '..', 'client', 'generated');
const specPath = path.resolve(__dirname, '..', '..', 'openapi.json');

async function main() {
  debugger;
  // Generate the OpenAPI document from the router
  const doc = await generateOpenAPIDocument(routerPath, {
    exportName: 'appRouter',
    title: 'Example API',
    version: '1.0.0',
  });

  // Write the spec to disk (useful for debugging / importing into other tools)
  writeFileSync(specPath, JSON.stringify(doc, null, 2) + '\n');
  console.log('OpenAPI spec written to', specPath);

  // Clean and regenerate the SDK
  rmSync(outputDir, { recursive: true, force: true });

  await createClient({
    input: specPath,
    output: outputDir,
    plugins: [
      {
        name: '@hey-api/typescript',
        '~resolvers': createTRPCHeyApiTypeResolvers(),
      },
      {
        name: '@hey-api/sdk',
        operations: { strategy: 'single' },
      },
    ],
    logs: { level: 'info' },
  });

  console.log('SDK generated at', outputDir);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

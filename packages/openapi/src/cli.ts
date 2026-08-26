#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * trpc-openapi – CLI that generates an OpenAPI 3.1 document from a tRPC
 * AppRouter type.
 *
 * Usage:
 *   trpc-openapi <router-file> [options]
 *
 * Options:
 *   --export, -e   Name of the exported router symbol  (default: AppRouter)
 *   --output, -o   Output file path                    (default: openapi.json)
 *   --title        OpenAPI info.title                  (default: tRPC API)
 *   --version      OpenAPI info.version                (default: 0.0.0)
 *   --help, -h     Show this help message
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';
import { generateOpenAPIDocument } from './generate';

// ---------------------------------------------------------------------------
// Arg parsing via node:util parseArgs
// ---------------------------------------------------------------------------

interface ParsedArgs {
  file: string | undefined;
  exportName: string;
  output: string;
  title: string;
  version: string;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let parsed;
  try {
    parsed = nodeParseArgs({
      args: argv.slice(2),
      options: {
        help: { type: 'boolean', short: 'h', default: false },
        export: { type: 'string', short: 'e', default: 'AppRouter' },
        output: { type: 'string', short: 'o', default: 'openapi.json' },
        title: { type: 'string', default: 'tRPC API' },
        version: { type: 'string', default: '0.0.0' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Unknown option: ${message}`);
    process.exit(1);
  }

  return {
    file: parsed.positionals[0],
    exportName: parsed.values.export,
    output: parsed.values.output,
    title: parsed.values.title,
    version: parsed.values.version,
    help: parsed.values.help,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const HELP = `
trpc-openapi – Generate an OpenAPI 3.1 document from a tRPC AppRouter type.

Usage:
  trpc-openapi <router-file> [options]

Arguments:
  router-file          Path to the TypeScript file that exports the router.

Options:
  -e, --export <name>  Name of the exported router symbol  [default: AppRouter]
  -o, --output <file>  Output file path                    [default: openapi.json]
      --title  <text>  OpenAPI info.title                  [default: tRPC API]
      --version <ver>  OpenAPI info.version                [default: 0.0.0]
  -h, --help           Show this help message

Examples:
  trpc-openapi ./src/server/router.ts
  trpc-openapi ./src/server/router.ts --output api.json --title "My API" --version 1.0.0
  trpc-openapi ./src/server/router.ts --export appRouter
`.trim();

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.file) {
    console.error('Error: router-file argument is required.\n');
    console.error(HELP);
    process.exit(1);
  }

  const routerFile = path.resolve(args.file);

  if (!fs.existsSync(routerFile)) {
    console.error(`Error: File not found: ${routerFile}`);
    process.exit(1);
  }

  console.log(`Generating OpenAPI document from: ${routerFile}`);

  let doc: Awaited<ReturnType<typeof generateOpenAPIDocument>>;
  try {
    doc = await generateOpenAPIDocument(routerFile, {
      exportName: args.exportName,
      title: args.title,
      version: args.version,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }

  const outputPath = path.resolve(args.output);
  fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`OpenAPI document written to: ${outputPath}`);
}

void main();

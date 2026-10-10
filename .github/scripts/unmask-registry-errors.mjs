// Diagnostic-only: make npm-registry-fetch include the response body in its
// error message.
//
// It normally appends the body only when the JSON carries an `error` key, and
// npm sends `{code, message}` — so npm's actual reason for a 403 is discarded
// before lerna ever sees it. Patching the installed copy keeps the real publish
// path intact, instead of reimplementing it and diagnosing something subtly
// different.
//
// Run against node_modules in CI. Never run this in a release job.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NEEDLE = "(body && body.error) ? ' - ' + body.error : ''";
const PATCH = "body ? ' - ' + JSON.stringify(body) : ''";

const found = [];

function walk(dir, depth = 0) {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'npm-registry-fetch') {
        const errors = join(path, 'lib', 'errors.js');
        try {
          statSync(errors);
          found.push(errors);
        } catch {
          /* no errors.js here */
        }
      } else if (
        entry.name === 'node_modules' ||
        entry.name === '.pnpm' ||
        depth < 3
      ) {
        walk(path, depth + 1);
      }
    }
  }
}

walk('node_modules');

if (found.length === 0) {
  console.log('no npm-registry-fetch copies found — nothing patched');
  process.exit(1);
}

let patched = 0;
for (const file of found) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes(NEEDLE)) {
    console.log(`skipped (expected expression not found): ${file}`);
    continue;
  }
  writeFileSync(file, src.replace(NEEDLE, PATCH));
  console.log(`patched: ${file}`);
  patched++;
}

if (patched === 0) {
  console.log(
    'found copies but patched none — the upstream source has changed',
  );
  process.exit(1);
}

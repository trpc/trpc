import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

/** A new temporary directory, removed when the scope ends */
export function tempDirResource(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return makeResource({ dir }, () => {
    rmSync(dir, { recursive: true, force: true });
  });
}

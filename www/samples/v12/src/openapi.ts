/**
 * Writes `./rest.ts`'s document for `../openapi-ts.config.ts`.
 */
import { writeFile } from 'node:fs/promises';

import { document } from './rest.ts';

await writeFile('openapi.json', `${JSON.stringify(document, null, 2)}\n`);

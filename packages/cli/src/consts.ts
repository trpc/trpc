import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const distPath = path.dirname(__filename);

/** Path relative to the CLI's root */
export const PKG_ROOT = path.join(distPath, '../');

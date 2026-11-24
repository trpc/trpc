import { exec } from 'node:child_process';
import { promisify } from 'node:util';

/** @internal */
export const execa = promisify(exec);

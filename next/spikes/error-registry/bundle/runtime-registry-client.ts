/**
 * The control: the registry client, importing the app's registry at
 * runtime as a client that rebuilds errors from it would.
 */
import { errors } from '../merge-errors/errors.ts';

export { title } from './registry-client.ts';
export const registry = errors;

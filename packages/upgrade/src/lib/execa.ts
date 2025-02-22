import * as CP from 'node:child_process';
import * as Util from 'node:util';

export const execa = Util.promisify(CP.exec);

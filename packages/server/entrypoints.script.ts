import { generateEntrypoints } from '../../scripts/entrypoints';
import { input } from './rollup.config.js';

// eslint-disable-next-line no-console
generateEntrypoints(input).catch(console.error);

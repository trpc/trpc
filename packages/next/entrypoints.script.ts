import { generateEntrypoints } from '../../scripts/entrypoints';
import { input } from './rollup.config';

// eslint-disable-next-line no-console
generateEntrypoints(input).catch(console.error);

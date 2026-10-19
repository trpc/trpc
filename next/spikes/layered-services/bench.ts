/**
 * Usage: `node layered-services/bench.ts [n=1000] [runs=5]` from `spikes/`.
 *
 * For each variant: generate the fixture and run `tsc --extendedDiagnostics
 * --singleThreaded` `runs` times; medians are reported. Every fixture also
 * checks the shipped package and the prototypes, so compare against `n=0`.
 */
import { join } from 'node:path';
import { runScript, variantBench } from '../kit.ts';
import { generate, variants } from './generate.ts';

runScript(
  import.meta,
  variantBench(
    'bench',
    variants,
    generate,
    join(import.meta.dirname, 'generated'),
  ),
);

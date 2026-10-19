// Usage (from next/spikes): node client-bundle/cuts.ts [fixture.ts]
//
// What each cut would save on the minimal client (fixtures/v12-minimal.ts),
// alone and stacked. A cut patches the shipped sources as rolldown loads
// them (exact string replacements, so a cut that no longer applies fails),
// standing in for the feature moving behind its own import. Nothing in
// packages/ changes.
import { kb, measure } from './bundle.ts';
import { cuts, patching } from './patches.ts';

const fixture = new URL(
  process.argv[2] ?? './fixtures/v12-minimal.ts',
  import.meta.url,
).pathname;
const base = await measure({ file: fixture });
console.log(`${fixture}: ${kb(base.min)} min, ${kb(base.gzip)} gzip\n`);
console.log('| cut | gzip | saves |');
console.log('| --- | ---: | ---: |');
for (const [name, cut] of Object.entries(cuts)) {
  const size = await measure({ file: fixture }, [patching([name])]);
  console.log(
    `| \`${name}\`: ${cut.what} | ${kb(size.gzip)} | ${kb(base.gzip - size.gzip)} |`,
  );
}

const stacks: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['queries and mutations only (sse + batch)', ['sse', 'batch']],
  ['+ plain jsonSerializer', ['sse', 'batch', 'json']],
  ['+ hand-rolled iterable', ['sse', 'batch', 'json', 'iterable']],
  ['+ raw fetch', ['sse', 'batch', 'json', 'iterable', 'fetch']],
  ['raw fetch, every feature kept', ['fetch']],
  ['raw fetch + plain jsonSerializer, features kept', ['fetch', 'json']],
];
console.log('\n| stacked | gzip | saves |');
console.log('| --- | ---: | ---: |');
for (const [what, names] of stacks) {
  const size = await measure({ file: fixture }, [patching(names)]);
  console.log(`| ${what} | ${kb(size.gzip)} | ${kb(base.gzip - size.gzip)} |`);
}

const all = Object.keys(cuts);
const lean = await measure({ file: fixture }, [patching(all)]);
console.log(
  `\nadded back on top of every cut (${kb(lean.gzip)}): what an opt-in import would cost\n`,
);
console.log('| kept | gzip | adds |');
console.log('| --- | ---: | ---: |');
for (const name of all) {
  const size = await measure({ file: fixture }, [
    patching(all.filter((n) => n !== name)),
  ]);
  console.log(
    `| \`${name}\` | ${kb(size.gzip)} | +${kb(size.gzip - lean.gzip)} |`,
  );
}

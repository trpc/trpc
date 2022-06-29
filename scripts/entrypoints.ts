/**
 * This file is a huge mess.
 */
import fs from 'fs';

const packages = [
  'client',
  // This script doesn't really work right yet with all the other packages b/c naming of `index.ts` is a bit of mess
];

const packagesDir = `${__dirname}/../packages`;

function getEntrypoint(filename: string) {
  const parts = filename.split('/');
  const name = parts.pop();

  parts.shift();
  const dir = parts.join();
  return {
    name,
    dir: `./${dir}`,
    depth: parts.length + 1,
  };
}
for (const pkg of packages) {
  const pkgDir = `${packagesDir}/${pkg}`;
  const packageJsonStr = fs.readFileSync(`${pkgDir}/package.json`, 'utf8');
  const pJson = JSON.parse(packageJsonStr.toString());

  const keys = Object.keys(pJson.exports).filter((v) => v !== '.');
  for (const key of keys) {
    // const file = `${packagesDir}/${pkg}/src/${name}.ts`;
    const entrypoint = getEntrypoint(key);
    // console.log({ name: key, entrypoint });

    fs.mkdirSync(`${pkgDir}/${entrypoint.dir}/${entrypoint.name}`, {
      recursive: true,
    });
    const dotdot = new Array(entrypoint.depth).fill('../').join('');
    const distTarget = `${dotdot}dist/${entrypoint.dir}/${entrypoint.name}`;
    fs.writeFileSync(
      `${pkgDir}/${entrypoint.dir}/${entrypoint.name}/index.js`,
      `module.exports = require('${new Array(entrypoint.depth).fill(
        '../',
      )}/dist/${entrypoint.dir}/${entrypoint.name}');\n`,
    );
    fs.writeFileSync(
      `${pkgDir}/${entrypoint.dir}/${entrypoint.name}/index.js`,
      `module.exports = require('${distTarget}');\n`,
    );
    fs.writeFileSync(
      `${pkgDir}/${entrypoint.dir}/${entrypoint.name}/index.d.ts`,
      `export * from '${distTarget}';\n`,
    );
  }
  fs.writeFileSync(
    `${pkgDir}/rollup.config.js`,
    `
import { getRollupConfig } from '../../scripts/rollup';

const config = getRollupConfig({
  input: [
    'src/index.ts',
    ${keys.map((v) => `'src/${v}.ts'`).join(',\n    ')},
  ],
});

export default config;
`.trimStart(),
  );
}

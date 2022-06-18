import fs from 'fs';

const packages = [
  //
  'client',
  'server',
  'next',
  'react',
];

const packagesDir = `${__dirname}/../packages`;

function getEntrypoint(filename: string) {
  const parts = filename.split('/');
  const name = parts.pop();
  if (parts.length > 1) {
    parts.shift();
  }
  const dir: string | undefined = parts.join();
  return {
    name,
    dir,
    depth: parts.length,
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
    console.log({ name: key, entrypoint });

    fs.mkdirSync(`${pkgDir}/${entrypoint.dir}/${entrypoint.name}`, {
      recursive: true,
    });
    fs.writeFileSync(
      `${pkgDir}/${entrypoint.dir}/${entrypoint.name}/index.js`,
      `module.exports = require('../../dist/${entrypoint.dir}/${entrypoint.name}');\n`,
    );
    fs.writeFileSync(
      `${pkgDir}/${entrypoint.dir}/${entrypoint.name}/index.js`,
      `module.exports = require('../../dist/${entrypoint.dir}/${entrypoint.name}');\n`,
    );
    fs.writeFileSync(
      `${pkgDir}/${entrypoint.dir}/${entrypoint.name}/index.ts`,
      `export * from '../../dist/${entrypoint.dir}/${entrypoint.name}';\n`,
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

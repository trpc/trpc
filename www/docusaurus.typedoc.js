/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-check

const fs = require('fs');
const path = require('path');
/**
 * @param {string[]} directories
 */
function generateTypedocDocusaurusPlugins(directories) {
  const withEntryPoints = directories.map((directory) => {
    const pkgJson = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, `../packages/${directory}/package.json`),
        'utf-8',
      ),
    );

    /**
     * @type {Record<string, string | { import: string }>}
     */
    const exports = pkgJson.exports;

    const entrypoints = Object.entries(exports)
      .flatMap(([_key, value]) => {
        if (typeof value === 'string') {
          return [];
        }

        return [value.import];
      })
      .map((it) => it.replace('./dist/', '').replace('.mjs', '.ts'))
      .filter((it) => {
        if (it.includes('unstable')) {
          return false;
        }
        switch (directory) {
          case 'client': {
            return true;
          }
          case 'next':
            // FIXME: this shouldn't be excluded
            return it === 'index.ts';
          case 'server':
            return (
              /**
               * @deprecated remove in v12
               */
              it === 'shared.ts'
            );
        }
        return true;
      });
    return {
      directory,
      entrypoints,
    };
  });
  console.log('TypeDoc entrypoints:', withEntryPoints);
  return withEntryPoints.map((opts, idx) => {
    const { directory, entrypoints } = opts;
    return [
      'docusaurus-plugin-typedoc',
      {
        // TypeDoc options
        // https://typedoc.org/guides/options/
        skipErrorChecking: true,
        id: directory,
        entryPoints: entrypoints.map(
          (it) => `../packages/${directory}/src/${it}`,
        ),
        tsconfig: `../packages/${directory}/tsconfig.build.json`,
        out: `./docs/typedoc/${directory}`,
        readme: 'none',
        sourceLinkTemplate:
          'https://github.com/trpc/trpc/blob/{gitRevision}/{path}#L{line}',
        excludeInternal: true,
        excludePrivate: true,
        excludeProtected: true,

        parametersFormat: 'table',
        sidebar: {
          autoConfiguration: true,
          pretty: true,
        },

        //Possible not needed code:
        // docusaurus-plugin-typedoc options
        // https://github.com/tgreyuk/typedoc-plugin-markdown/tree/master/packages/docusaurus-plugin-typedoc#plugin-options
        // sidebar: {
        //   categoryLabel: `@trpc/${directory}`,
        //   position: idx,
        // },
      },
    ];
  });
}

module.exports = { generateTypedocDocusaurusPlugins };

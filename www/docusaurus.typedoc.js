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
      .map((it) => it.replace('./dist', 'src').replace('.mjs', '.ts'))
      .filter((it) => {
        // omit some files?
        switch (directory) {
          case 'client': {
            return it.includes('src/index.ts');
          }
        }
        return true;
      });
    console.log('entrypoints', directory, entrypoints);
    return {
      directory,
      entrypoints,
    };
  });
  return withEntryPoints.map((opts, idx) => {
    const { directory, entrypoints } = opts;
    return [
      'docusaurus-plugin-typedoc',
      {
        // TypeDoc options
        // https://typedoc.org/guides/options/
        skipErrorChecking: true,
        id: directory,
        entryPoints: entrypoints.map((it) => `../packages/${directory}/${it}`),
        tsconfig: `../packages/${directory}/tsconfig.build.json`,
        out: `./typedoc/${directory}`,
        readme: 'none',
        sourceLinkTemplate:
          'https://github.com/trpc/trpc/blob/{gitRevision}/{path}#L{line}',
        excludeInternal: true,
        excludePrivate: true,
        excludeProtected: true,

        // docusaurus-plugin-typedoc options
        // https://github.com/tgreyuk/typedoc-plugin-markdown/tree/master/packages/docusaurus-plugin-typedoc#plugin-options
        sidebar: {
          categoryLabel: `@trpc/${directory}`,
          position: idx,
        },

        // Markdown options
        // https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs#markdown-front-matter
        frontmatterGlobals: {
          pagination_prev: null,
          pagination_next: null,
          custom_edit_url: null,
        },
      },
    ];
  });
}

module.exports = { generateTypedocDocusaurusPlugins };

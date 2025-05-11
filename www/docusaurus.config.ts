/// <reference types="@docusaurus/module-type-aliases" />
/* eslint-disable @typescript-eslint/no-require-imports */
import fs from 'fs';
import path from 'path';
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { generateTypedocDocusaurusPlugins } from './docusaurus.typedoc.js';
import { parseEnv } from './src/utils/env';

const env = parseEnv(process.env);

const poweredByVercel = `
  <div style="padding-top: 24px;">
    <a
      href="https://vercel.com/?utm_source=trpc&utm_campaign=oss"
      target="_blank"
      rel="noreferrer"
    >
      <img
        src="/img/powered-by-vercel.svg"
        alt="Powered by Vercel"
        style="height: 40px;display:inline-block;box-shadow: 0px 0px 32px rgba(255, 255, 255, 0.2);"
      />
    </a>
  </div>
`.trim();

export default {
  title: 'tRPC',
  tagline: 'Move Fast and Break Nothing.\nEnd-to-end typesafe APIs made easy.',
  url: 'https://trpc.io',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  onDuplicateRoutes: 'throw',
  favicon: 'img/favicon.ico',
  organizationName: 'trpc', // Usually your GitHub org/user name.
  projectName: 'trpc', // Usually your repo name.
  future: {
    experimental_faster: true,
  },
  themeConfig: {
    disableSwitch: false,
    respectPrefersColorScheme: true,
    image: `${env.OG_URL}/api/landing?cache-buster=${new Date().getDate()}`,
    algolia: {
      appId: 'BTGPSR4MOE',
      apiKey: 'ed8b3896f8e3e2b421e4c38834b915a8',
      indexName: 'trpc',
      // contextualSearch: true,
      // searchParameters: {},
    },
    announcementBar: {
      id: 'v11',
      content:
        "🎉 tRPC v11 is now released! Check out <a href='/blog/announcing-trpc-11'><strong>the blog post now</strong></a>.",
      backgroundColor: 'var(--ifm-color-primary-dark)',
      textColor: '#ffffff',
      isCloseable: true,
    },
    navbar: {
      title: 'tRPC',
      logo: {
        alt: 'tRPC logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          to: 'docs',
          label: 'Docs',
          activeBaseRegex: 'docs(/?)$',
        },
        {
          to: 'docs/quickstart',
          label: 'Quickstart',
        },
        {
          to: 'docs/community/awesome-trpc',
          label: 'Awesome tRPC Collection',
        },
        {
          to: 'docs/client/nextjs',
          label: 'Using Next.js',
        },
        {
          href: 'https://github.com/trpc/trpc',
          position: 'right',
          className: 'header-social-link header-github-link',
          'aria-label': 'GitHub',
        },
        {
          href: 'https://twitter.com/trpcio',
          position: 'right',
          className: 'header-social-link header-twitter-link',
          'aria-label': 'Twitter',
        },
        {
          href: 'https://trpc.io/discord',
          position: 'right',
          className: 'header-social-link header-discord-link',
          'aria-label': 'Discord',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
          dropdownActiveClassDisabled: true,
        },
      ],
    },
    footer: {
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Docs',
              to: 'docs',
            },
            {
              label: 'Usage with Next.js',
              to: 'docs/client/nextjs',
            },
            {
              label: 'FAQ / Troubleshooting',
              to: 'docs/faq',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/trpc/trpc/tree/main',
              className: 'flex items-center',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/alexdotjs',
              className: 'flex items-center',
            },
            {
              label: 'Discord',
              href: 'https://trpc.io/discord',
              className: 'flex items-center',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: 'blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/trpc/trpc/tree/main',
              className: 'flex items-center',
            },
            {
              label: '❤️ Sponsor tRPC',
              href: 'https://trpc.io/sponsor',
              className: 'flex items-center',
            },
          ],
        },
      ],
      copyright: poweredByVercel,
    },
  } satisfies Preset.ThemeConfig,
  plugins: [
    // Sidebar order is decided by the position in the array below
    ...(env.TYPEDOC
      ? generateTypedocDocusaurusPlugins([
          'server',
          'client',
          'react-query',
          'next',
        ])
      : []),
    async function myPlugin() {
      return {
        name: 'docusaurus-tailwindcss',
        configurePostCss(postcssOptions) {
          // Appends TailwindCSS, AutoPrefixer & CSSNano.
          postcssOptions.plugins.push(require('tailwindcss'));
          postcssOptions.plugins.push(require('autoprefixer'));
          if (process.env.NODE_ENV === 'production') {
            postcssOptions.plugins.push(require('cssnano'));
          }
          return postcssOptions;
        },
      };
    },
    /**
     * Thank you to prisma docs for this plugin <3
     * https://github.com/prisma/docs/blob/22208d52e4168028dbbe8b020b10682e6b526e50/docusaurus.config.ts#L95
     */
    async function pluginLlmsTxt(context) {
      const { siteDir, siteConfig } = context;

      // Helper function to get all MDX content from a specific directory (relative to siteDir)
      const getAllMdxContent = async (
        docsContentPath: string,
      ): Promise<string[]> => {
        const absoluteDocsContentPath = path.join(siteDir, docsContentPath);
        const mdxFiles: string[] = [];

        // Recursive function to find all .md/.mdx files
        const findMdxFilesRecursively = async (currentPath: string) => {
          let entries;
          try {
            entries = await fs.promises.readdir(currentPath, {
              withFileTypes: true,
            });
          } catch (error) {
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              (error as any).code === 'ENOENT'
            ) {
              console.warn(
                `[llms-txt-plugin] Directory not found: ${currentPath}. Skipping MDX content for this path.`,
              );
              return; // Directory does not exist, so no files to add
            }
            console.error(
              `[llms-txt-plugin] Error reading directory ${currentPath}:`,
              error,
            );
            throw error;
          }

          for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
              if (entry.name === 'typedoc') {
                continue;
              }
              await findMdxFilesRecursively(fullPath);
            } else if (
              entry.name.endsWith('.mdx') ||
              entry.name.endsWith('.md')
            ) {
              try {
                const content = await fs.promises.readFile(fullPath, 'utf8');
                mdxFiles.push(content);
              } catch (readError) {
                console.error(
                  `[llms-txt-plugin] Error reading file ${fullPath}:`,
                  readError,
                );
              }
            }
          }
        };

        await findMdxFilesRecursively(absoluteDocsContentPath);
        return mdxFiles;
      };

      return {
        name: 'llms-txt-plugin',
        postBuild: async ({ routes, outDir }) => {
          const versionsToProcessConfig = [
            {
              keyInDocusaurusConfig: 'current',
              docsPath: 'docs',
              routePath: '/docs',
              fileSuffix: '',
            },
            {
              keyInDocusaurusConfig: '10.x',
              docsPath: 'versioned_docs/version-10.x',
              routePath: '/docs/v10',
              fileSuffix: '-v10',
            },
            {
              keyInDocusaurusConfig: '9.x',
              docsPath: 'versioned_docs/version-9.x',
              routePath: '/docs/v9',
              fileSuffix: '-v9',
            },
          ];

          let docsVersionSettings: any = null;
          const docsPresetTuple = siteConfig.presets?.find(
            (p): p is [string, Record<string, any>] =>
              Array.isArray(p) && p[0] === '@docusaurus/preset-classic',
          );
          if (
            docsPresetTuple &&
            typeof docsPresetTuple[1] === 'object' &&
            docsPresetTuple[1] !== null
          ) {
            const presetConfig = docsPresetTuple[1];
            if (
              typeof presetConfig.docs === 'object' &&
              presetConfig.docs !== null &&
              'versions' in presetConfig.docs
            ) {
              docsVersionSettings = presetConfig.docs.versions;
            }
          }

          const docsPluginRouteConfig = routes.find(
            (route) =>
              route.plugin?.name === 'docusaurus-plugin-content-docs' &&
              route.plugin?.id === 'default',
          );

          if (!docsPluginRouteConfig || !docsPluginRouteConfig.routes) {
            console.error(
              '[llms-txt-plugin] Critical: Could not find routes from docusaurus-plugin-content-docs. Aborting LLMS file generation.',
            );
            return;
          }

          for (const versionSpec of versionsToProcessConfig) {
            let versionLabel = versionSpec.keyInDocusaurusConfig;
            if (docsVersionSettings) {
              if (
                versionSpec.keyInDocusaurusConfig === 'current' &&
                docsVersionSettings.current?.label
              ) {
                versionLabel = docsVersionSettings.current.label;
              } else if (
                docsVersionSettings[versionSpec.keyInDocusaurusConfig]?.label
              ) {
                versionLabel =
                  docsVersionSettings[versionSpec.keyInDocusaurusConfig].label;
              }
            }

            const mdxContents = await getAllMdxContent(versionSpec.docsPath);
            if (mdxContents.length > 0) {
              const fullOutputFilename = `llms${versionSpec.fileSuffix}-full.txt`;
              const concatenatedMdxPath = path.join(outDir, fullOutputFilename);
              try {
                await fs.promises.writeFile(
                  concatenatedMdxPath,
                  mdxContents.join(
                    '\n\n--------------------------------------------------\n\n',
                  ),
                );
                console.log(
                  `[llms-txt-plugin] Generated ${concatenatedMdxPath} for version ${versionLabel}`,
                );
              } catch (writeError) {
                console.error(
                  `[llms-txt-plugin] Error writing ${concatenatedMdxPath}:`,
                  writeError,
                );
              }
            } else {
              console.warn(
                `[llms-txt-plugin] No MDX content found for version '${versionLabel}' in '${versionSpec.docsPath}'. Skipping ${`llms${versionSpec.fileSuffix}-full.txt`}.`,
              );
            }

            const versionSpecificDocsRoute = docsPluginRouteConfig.routes.find(
              (route) => route.path === versionSpec.routePath,
            );

            const versionProp = versionSpecificDocsRoute?.props?.version;

            if (
              !(
                typeof versionProp === 'object' &&
                versionProp !== null &&
                'docs' in versionProp &&
                typeof (versionProp as any).docs === 'object' &&
                (versionProp as any).docs !== null
              )
            ) {
              console.warn(
                `[llms-txt-plugin] No docs data structure found in versionProp for version '${versionLabel}' (route path: ${versionSpec.routePath}). Skipping TOC file llms${versionSpec.fileSuffix}.txt.`,
              );
              continue;
            }

            const docsDataForVersion = versionProp.docs as Record<
              string,
              {
                id: string;
                title: string;
                description?: string;
                [key: string]: any;
              }
            >;

            const tocRecords = Object.values(docsDataForVersion)
              .filter((docItem) => {
                if (!docItem?.id || !docItem.title) {
                  return false;
                }
                if (
                  docItem.id.startsWith('typedoc/') ||
                  docItem.id.includes('/typedoc/')
                ) {
                  return false;
                }
                return true;
              })
              .map((docItem) => {
                let link = `${versionSpec.routePath}/${docItem.id}`;
                link = link.replace(new RegExp('([^:])//', 'g'), '$1/');
                return `- [${docItem.title}](${link}): ${docItem.description ?? 'No description available'}`;
              });

            if (tocRecords.length > 0) {
              const tocOutputFilename = `llms${versionSpec.fileSuffix}.txt`;

              let titleVersionSuffix = versionLabel;
              if (
                docsVersionSettings?.current?.label &&
                versionLabel === docsVersionSettings.current.label
              ) {
                titleVersionSuffix = '';
              } else if (
                versionSpec.keyInDocusaurusConfig === 'current' &&
                !docsVersionSettings?.current?.label
              ) {
                titleVersionSuffix = '';
              }
              const tocTitle =
                `${siteConfig.title} - Docs ${titleVersionSuffix}`.trim();

              let otherVersionsLinksContent = '';
              for (const otherVersion of versionsToProcessConfig) {
                if (
                  otherVersion.keyInDocusaurusConfig ===
                  versionSpec.keyInDocusaurusConfig
                ) {
                  continue;
                }

                let rawSourceLabel = otherVersion.keyInDocusaurusConfig;
                if (docsVersionSettings) {
                  if (
                    otherVersion.keyInDocusaurusConfig === 'current' &&
                    docsVersionSettings.current?.label
                  ) {
                    rawSourceLabel = docsVersionSettings.current.label;
                  } else if (
                    docsVersionSettings[otherVersion.keyInDocusaurusConfig]
                      ?.label
                  ) {
                    rawSourceLabel =
                      docsVersionSettings[otherVersion.keyInDocusaurusConfig]
                        .label;
                  }
                } else if (otherVersion.keyInDocusaurusConfig === 'current') {
                  rawSourceLabel = 'current';
                }

                let displayTag = rawSourceLabel;
                if (displayTag.endsWith('.x')) {
                  displayTag = 'v' + displayTag.slice(0, -2);
                }

                const linkUrl = new URL(
                  `llms${otherVersion.fileSuffix}.txt`,
                  siteConfig.url,
                ).href;
                const isOtherVersionActuallyCurrent =
                  otherVersion.keyInDocusaurusConfig === 'current';

                const linkTextParts = [`For ${displayTag}`];
                if (isOtherVersionActuallyCurrent) {
                  linkTextParts.push('(current)');
                }

                otherVersionsLinksContent += `- ${linkTextParts.join(' ')}: ${linkUrl}\n`;
              }

              if (otherVersionsLinksContent) {
                otherVersionsLinksContent += '\n';
              }

              const tocFileContent = `${tocTitle}\n\n${otherVersionsLinksContent}## Documentation Pages\n\n${tocRecords.join('\n')}`;
              const tocFilePath = path.join(outDir, tocOutputFilename);
              try {
                fs.writeFileSync(tocFilePath, tocFileContent);
                console.log(
                  `[llms-txt-plugin] Generated ${tocFilePath} for version ${versionLabel}`,
                );
              } catch (err) {
                console.error(
                  `[llms-txt-plugin] Error writing TOC file ${tocFilePath}:`,
                  err,
                );
              }
            } else {
              console.warn(
                `[llms-txt-plugin] No document records with id and title (excluding typedoc) found to generate TOC for version '${versionLabel}'. Skipping llms${versionSpec.fileSuffix}.txt.`,
              );
            }
          }
        },
      };
    },
  ],
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          lastVersion: 'current',
          // disableVersioning: true,
          // onlyIncludeVersions: ['9.x'],
          versions: {
            current: {
              label: '11.x',
              // path: 'v10',
              badge: true,
              // className: 'v11',
              banner: 'none',
            },
            '10.x': {
              label: '10.x',
              path: 'v10',
              badge: true,
              // className: 'v10',
              banner: 'unmaintained',
            },
            '9.x': {
              label: '9.x',
              path: 'v9',
              badge: true,
              // className: 'v9',
              banner: 'unmaintained',
            },
          },
          // includeCurrentVersion: false,
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl: 'https://github.com/trpc/trpc/tree/main/www/',
          remarkPlugins: [
            [
              require('remark-shiki-twoslash').default,
              require('./shikiTwoslash.config'),
            ],
            require('./mdxToJsx'), // Transforms HTML nodes output by shiki-twoslash into JSX nodes
          ],
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl: 'https://github.com/trpc/trpc/tree/main/www/',
          remarkPlugins: [
            [
              require('remark-shiki-twoslash').default,
              require('./shikiTwoslash.config'),
            ],
            require('./mdxToJsx'), // Transforms HTML nodes output by shiki-twoslash into JSX nodes
          ],
        },
        theme: {
          customCss: ['./src/css/custom.css'],
        },
        gtag: {
          trackingID: 'G-7KLX2VFLVR',
        },
      } satisfies Preset.Options,
    ],
  ],
  scripts: [
    {
      async: true,
      src: 'https://platform.twitter.com/widgets.js',
      charSet: 'utf-8',
    },
  ],
  clientModules: [
    require.resolve('./docusaurus.twitterReload.js'),
    require.resolve('./docusaurus.preferredTheme.js'),
  ],

  customFields: {
    env,
  },
} satisfies Config;

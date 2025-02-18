import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
import { parseEnv } from './src/utils/env';

const env = parseEnv(process.env);

const config: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'tRPC',
      collapsed: false,
      link: {
        type: 'doc',
        id: 'main/introduction',
      },
      items: [
        'main/getting-started',
        'main/concepts',
        'main/quickstart',
        'main/videos-and-community-resources',
        'main/example-apps',
      ],
    },
    {
      type: 'category',
      label: 'Backend Usage',
      collapsed: true,
      link: {
        type: 'generated-index',
        title: 'tRPC server documentation',
        slug: '/server/introduction',
      },
      items: [
        'server/routers',
        'server/procedures',
        'server/validators',
        'server/merging-routers',
        'server/context',
        'server/middlewares',
        {
          type: 'category',
          label: 'Hosting tRPC with Adapters',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'server/adapters-intro',
          },
          items: [
            'server/adapters/standalone',
            'server/adapters/express',
            'server/adapters/fastify',
            'server/adapters/nextjs',
            'server/adapters/aws-lambda',
            'server/adapters/fetch',
          ],
        },
        'server/server-side-calls',
        'server/authorization',
        'server/error-handling',
        'server/error-formatting',
        'server/data-transformers',
        'server/metadata',
        'server/caching',
        'server/subscriptions',
        'server/websockets',
      ],
    },
    {
      type: 'category',
      label: 'Client Usage',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'client/overview',
      },
      items: [
        {
          type: 'category',
          label: 'TanStack React Query (⭐️)',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'client/tanstack-react-query/setup',
          },
          items: [
            'client/tanstack-react-query/setup',
            'client/tanstack-react-query/usage',
            'client/tanstack-react-query/migrating',
            'client/tanstack-react-query/server-components',
          ],
        },
        {
          type: 'category',
          label: 'React Query Integration (Classic)',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'client/react/introduction',
          },
          items: [
            'client/react/setup',
            'client/react/server-components',
            'client/react/infer-types',
            'client/react/useQuery',
            'client/react/useMutation',
            'client/react/useInfiniteQuery',
            'client/react/useSubscription',
            'client/react/useUtils',
            'client/react/createTRPCQueryUtils',
            'client/react/useQueries',
            'client/react/suspense',
            'client/react/getQueryKey',
            'client/react/aborting-procedure-calls',
            'client/react/disabling-queries',
          ],
        },
        {
          type: 'category',
          label: 'Next.js Integration',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'client/nextjs/introduction',
          },
          items: [
            'client/nextjs/setup',
            'client/nextjs/ssr',
            'client/nextjs/ssg',
            'client/nextjs/server-side-helpers',
            'client/nextjs/aborting-procedure-calls',
            'client/nextjs/starter-projects',
          ],
        },
        {
          type: 'category',
          label: 'Vanilla Client',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'client/vanilla/introduction',
          },
          items: [
            'client/vanilla/setup',
            'client/vanilla/infer-types',
            'client/vanilla/aborting-procedure-calls',
          ],
        },
        {
          type: 'category',
          label: 'Links',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'client/links/overview',
          },
          items: [
            'client/links/httpLink',
            'client/links/httpBatchLink',
            'client/links/httpBatchStreamLink',
            'client/links/httpSubscriptionLink',
            'client/links/wsLink',
            'client/links/splitLink',
            'client/links/loggerLink',
            'client/links/retryLink',
          ],
        },
        'client/headers',
        'client/cors',
      ],
    },
    {
      type: 'category',
      label: 'Extra information',
      collapsed: true,
      link: {
        type: 'generated-index',
        title: 'Extra Information',
        slug: '/further',
      },
      items: ['further/faq', 'further/rpc', 'further/further-reading'],
    },
    ...(env.TYPEDOC
      ? [
          {
            type: 'category',
            label: 'API Reference (Auto-generated)',
            collapsed: true,
            items: [
              {
                type: 'autogenerated',
                dirName: 'typedoc',
              },
            ],
          },
        ]
      : []),
    {
      type: 'doc',
      id: 'migration/migrate-from-v10-to-v11',
    },
    {
      type: 'category',
      label: 'Community',
      collapsed: true,
      items: [
        'community/awesome-trpc',
        'community/contributing',
        'community/love',
        'community/sponsors',
      ],
    },
  ],
};

export default config;

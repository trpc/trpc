module.exports = {
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
        'main/practical-example',
        'main/anatomy-of-trpc',
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
        'server/output-validation',
        'server/infer-types',
        'server/error-handling',
        'server/error-formatting',
        'server/data-transformers',
        'server/metadata',
        'server/caching',
      ],
    },
    {
      type: 'category',
      label: 'Client Usage',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'client/introduction',
      },
      items: [
        'client/setup',
        'client/aborting-procedure-calls',
        {
          type: 'category',
          label: 'Links',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'client/links/links',
          },
          items: [
            'client/links/httpLink',
            'client/links/httpBatchLink',
            'client/links/wsLink',
            'client/links/splitLink',
            'client/links/loggerLink',
          ],
        },
        'client/headers',
        'client/cors',
      ],
    },
    {
      type: 'category',
      label: 'React Query Integration',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'reactjs/introduction',
      },
      items: [
        'reactjs/setup',
        'reactjs/aborting-procedure-calls',
        'reactjs/useQuery',
        'reactjs/useMutation',
        'reactjs/useInfiniteQuery',
        'reactjs/useContext',
        'reactjs/useQueries',
        'reactjs/getQueryKey',
      ],
    },
    {
      type: 'category',
      label: 'Next.js Integration',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'nextjs/introduction',
      },
      items: [
        'nextjs/setup',
        'nextjs/aborting-procedure-calls',
        'nextjs/ssr',
        'nextjs/ssg',
        'nextjs/server-side-helpers',
        'nextjs/starter-projects',
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
      items: [
        'further/faq',
        'further/rpc',
        'further/subscriptions',
        'further/further-reading',
      ],
    },
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
    {
      type: 'doc',
      id: 'migration/migrate-from-v9-to-v10',
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

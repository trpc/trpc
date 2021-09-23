export const SITE = {
  title: 'Your Documentation Website',
  description: 'Your website description.',
  defaultLanguage: 'en_US',
};

export const OPEN_GRAPH = {
  image: {
    src: 'https://github.com/snowpackjs/astro/blob/main/assets/social/banner.png?raw=true',
    alt:
      'astro logo on a starry expanse of space,' +
      ' with a purple saturn-like planet floating in the right foreground',
  },
  twitter: 'astrodotbuild',
};

export const KNOWN_LANGUAGES = {
  English: 'en',
};

// Uncomment this to add an "Edit this page" button to every page of documentation.
// export const GITHUB_EDIT_URL = `https://github.com/snowpackjs/astro/blob/main/docs/`;

// Uncomment this to add an "Join our Community" button to every page of documentation.
// export const COMMUNITY_INVITE_URL = `https://astro.build/chat`;

// Uncomment this to enable site search.
// See "Algolia" section of the README for more information.
// export const ALGOLIA = {
//   indexName: 'XXXXXXXXXX',
//   apiKey: 'XXXXXXXXXX',
// }

export const SIDEBAR = {
  en: [
    { text: '', header: true },
    { text: 'Intro', link: 'en/introduction' },
    { text: 'Quick Start', link: 'en/main/quickstart' },
    { text: 'Example Apps', link: 'en/main/example-apps' },
    { text: 'Usage with Next.js', link: 'en/nextjs' },
    { text: 'Usage with React', link: 'en/react' },
    { text: 'Contributing', link: 'en/main/contributing' },
    { text: 'Testimonials', link: 'en/main/love' },
    { text: 'Sponsors', link: 'en/main/sponsors' },

    { text: '@trpc/server', header: true },
    { text: 'Define Router', link: 'en/server/router' },
    { text: 'Merging Routers', link: 'en/server/merging-routers' },
    { text: 'Request Context', link: 'en/server/context' },
    { text: 'Middlewares', link: 'en/server/middlewares' },
    { text: 'Authorization', link: 'en/server/authorization' },
    { text: 'Error Handling', link: 'en/server/error-handling' },
    { text: 'Error Formatting', link: 'en/server/error-formatting' },
    { text: 'Data Transformers', link: 'en/server/data-transformers' },
    { text: 'Response Caching', link: 'en/server/caching' },
    { text: 'Adapter: Express.js', link: 'en/server/express' },

    { text: '@trpc/client', header: true },
    { text: 'Create Vanilla Client', link: 'en/client/vanilla' },
    { text: 'Links & Requests Batching', link: 'en/client/links' },

    { text: '@trpc/react', header: true },
    { text: 'useQuery', link: 'en/react/useQuery' },
    { text: 'useMutation', link: 'en/react/useMutation' },
    { text: 'useInfiniteQuery', link: 'en/react/useInfiniteQuery' },
    { text: 'invalidateQuery', link: 'en/react/invalidateQuery' },

    { text: '@trpc/next', header: true },
    { text: 'Server-Side Rendering (SSR)', link: 'en/nextjs/ssr' },
    { text: 'Static Site Generation (SSG)', link: 'en/nextjs/ssg' },
    { text: 'Starter Projects', link: 'en/nextjs/starter-projects' },

    { text: 'Extra Information', header: true },
    { text: 'HTTP RPC Specification', link: 'en/further/rpc' },
    { text: 'Subscriptions and WebSockets', link: 'en/further/subscriptions' },
    { text: 'Further Reading', link: 'en/further/further-reading' },
  ],
};

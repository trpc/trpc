export const SITE = {
  title: "Your Documentation Website",
  description: "Your website description.",
  defaultLanguage: "en_US",
};

export const OPEN_GRAPH = {
  image: {
    src: "https://github.com/snowpackjs/astro/blob/main/assets/social/banner.png?raw=true",
    alt:
      "astro logo on a starry expanse of space," +
      " with a purple saturn-like planet floating in the right foreground",
  },
  twitter: "astrodotbuild",
};

export const KNOWN_LANGUAGES = {
  English: "en",
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
    { text: "", header: true },
    { text: "Intro", link: "en/introduction" },
    { text: "Quick Start", link: "en/main/quickstart" },
    { text: "Example Apps", link: "en/main/example-apps" },
    { text: "Usage with Next.js", link: "en/nextjs" },
    { text: "Usage with React", link: "en/react" },
    { text: "Contributing", link: "en/main/contributing" },
    { text: "Testimonials", link: "en/main/love" },
    { text: "Sponsors", link: "en/main/sponsors" },

    { text: "Another Section", header: true },
    { text: "Page 4", link: "en/page-4" },
  ],
};

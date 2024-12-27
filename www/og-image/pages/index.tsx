import Head from 'next/head';
import { useEffect, useState } from 'react';
import { blogParams, docsParams } from 'utils/zodParams';

const ogImageUrl = `${
  process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''
}/api/landing`;

export default function Page() {
  const [nonce, setNonce] = useState(Math.random());

  useEffect(() => {
    // randomize nonce on window focus
    const handleFocus = () => setNonce(Math.random());
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);
  return (
    <div>
      <Head>
        <meta name="og:title" content="tRPC OG Image Playground" />
        <meta
          name="og:description"
          content="Playground for OG Image Generation using @vercel/og-image"
        />
        <meta name="og:image" content={ogImageUrl} />
        <meta data-rh="true" name="twitter:image" content={ogImageUrl} />
      </Head>
      <h1>A page with Open Graph Image.</h1>
      <main className="grid grid-flow-row grid-cols-2">
        <div>
          <h2>Landing</h2>
          <img src={`/api/landing?random=${nonce}`} />
        </div>
        <div>
          <h2>Blog</h2>
          <img
            src={`/api/blog?${blogParams.toSearchString({
              authorImg: 'https://avatars.githubusercontent.com/u/459267',
              authorName: 'Alex "KATT" Johansson',
              authorTitle: 'Creator of tRPC',
              date: '2021-08-01',
              description:
                'Eiusmod elit id dolor proident Lorem ut quis exercitation velit cupidatat sit occaecat. Fugiat do culpa exercitation quis anim tempor excepteur sit qui dolor ex aute in. Proident magna eiusmod mollit amet tempor aute in. Labore officia Lorem velit adipisicing reprehenderit. Incididunt aute aliqua Lorem qui consectetur eiusmod pariatur ut exercitation ea est mollit quis.',
              readingTimeInMinutes: 5,
              title:
                'This is going to be a really long title for a blog post, it will probably wrap around a few times',
            })}&random=${nonce}`}
          />
        </div>
        <div>
          <h2>Docs</h2>
          <img
            src={`/api/docs?${docsParams.toSearchString({
              description:
                'The createContext() function is called for each request, and the result is propagated to all resolvers. You can use this to pass contextual data down to the resolvers. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
              title: 'Inferring types',
              permalink: '/docs/inferring-types',
            })}&random=${nonce}`}
          />
        </div>
      </main>
      {}
      <style jsx>{`
        img {
          max-width: 100%;
          width: 600px;
        }
      `}</style>
    </div>
  );
}

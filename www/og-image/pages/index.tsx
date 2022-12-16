import Head from 'next/head';
import { blogParams, docsParams } from 'utils/zodParams';

const ogImageUrl = `${
  process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''
}/api/landing`;

export default function Page() {
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
      <main className="grid grid-cols-2 grid-flow-row">
        <div>
          <h2>Landing</h2>
          <img src={`/api/landing?random=${Math.random()}`} />
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
              title: 'This is going to be a really long title for a blog post',
            })}&random=${Math.random()}`}
          />
        </div>
        <div>
          <h2>Docs</h2>
          <img
            src={`/api/docs?${docsParams.toSearchString({
              description:
                'The createContext() function is called for each request, and the result is propagated to all resolvers. You can use this to pass contextual data down to the resolvers.',
              title: 'Inferring types',
              permalink: '/docs/inferring-types',
            })}&random=${Math.random()}`}
          />
        </div>
      </main>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx>{`
        img {
          max-width: 100%;
          width: 600px;
        }
      `}</style>
    </div>
  );
}

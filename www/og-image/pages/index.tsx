import Head from 'next/head';
import { blogParamsSchema } from './api/blog';
import { docsParamsSchema } from './api/docs';

function searchParams<T extends Record<string, string | string[]>>(
  obj: T,
): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];

      return values.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
    })
    .join('&');
}

export default function Page() {
  return (
    <div>
      <Head>
        <meta name="og:title" content="Vercel Edge Network" />
        <meta name="og:description" content="Vercel Edge Network" />
      </Head>
      <h1>tRPC Open Graph images</h1>
      <main>
        <section>
          <h2>Blog</h2>
          <img
            src={`/api/blog?${searchParams<typeof blogParamsSchema['_input']>({
              authorImg: 'https://avatars.githubusercontent.com/u/459267',
              authorName: 'Alex "KATT" Johansson',
              authorTitle: 'Creator of tRPC',
              date: '2021-08-01',
              description: 'A blog post about trpc',
              readingTime: '5',
              title: 'Hello world',
            })}&random=${Math.random()}`}
          />
        </section>
        <section>
          <h2>Docs</h2>
          <img
            src={`/api/docs?${searchParams<typeof docsParamsSchema['_input']>({
              description: 'A blog post about trpc',
              title: 'Hello world',
            })}&random=${Math.random()}`}
          />
        </section>
      </main>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx>{`
        img {
          width: 600px;
          max-width: 100%;
        }
      `}</style>
    </div>
  );
}

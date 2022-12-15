import Head from 'next/head';
import { blogParams, docsParams } from 'utils/zodParams';

export default function Page() {
  return (
    <div>
      <Head>
        <meta name="og:title" content="Vercel Edge Network" />
        <meta name="og:description" content="Vercel Edge Network" />
        <meta
          name="og:image"
          content={
            // Because OG images must have a absolute URL, we use the
            // `VERCEL_URL` environment variable to get the deployment’s URL.
            // More info:
            // https://vercel.com/docs/concepts/projects/environment-variables
            `${
              process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''
            }/api/vercel`
          }
        />
      </Head>
      <h1>A page with Open Graph Image.</h1>
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
      <h2>Docs</h2>
      <img
        src={`/api/docs?${docsParams.toSearchString({
          description:
            'The createContext() function is called for each request, and the result is propagated to all resolvers. You can use this to pass contextual data down to the resolvers.',
          title: 'Inferring types',
          url: 'https://trpc.io/docs/inferring-types',
        })}&random=${Math.random()}`}
      />
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx>{`
        img {
          max-width: 100%;
        }
      `}</style>
    </div>
  );
}

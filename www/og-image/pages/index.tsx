import Head from 'next/head';

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
      <img src="/api/blog?title=x&description=x&date=2020-01-01&readingTime=1&authorName=alex&authorTitle=o&authorImg=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F459267%3Fv%3D4" />

      <h2>Docs</h2>
      <img src="/api/docs?title=x&description=y" />
    </div>
  );
}

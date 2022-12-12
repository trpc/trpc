import Head from 'next/head';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

export default function Page() {
  return (
    <div>
      <Head>
        <meta name="og:title" content="Vercel Edge Network" />
        <meta name="og:description" content="Vercel Edge Network" />
        <meta name="og:image" content={`${getBaseUrl()}/api/vercel`} />
      </Head>
      <h1>A page with Open Graph Image.</h1>
      <a href={getBaseUrl() + '/api/vercel'}>See preview</a>
    </div>
  );
}

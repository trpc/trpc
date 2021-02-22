import Head from 'next/head';
import { trpc } from '../utils/trpc';

export default function Home() {
  // try typing here to see that you get autocompletion & type safety on the procedure's name
  const helloNoArgs = trpc.useQuery(['hello']);
  const helloWithArgs = trpc.useQuery(['hello', { text: 'client' }]);

  // try to uncomment next line to show type checking:
  // const helloWithInvalidArgs = trpc.useQuery(['hello', { text: false }]);

  console.log(helloNoArgs.data); // <-- hover over this object to see it's type inferred

  return (
    <>
      <Head>
        <title>Hello tRPC</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>Hello World Example</h1>
      <ul>
        <li>
          helloNoArgs ({helloNoArgs.status}):{' '}
          <pre>{JSON.stringify(helloNoArgs.data, null, 2)}</pre>
        </li>
        <li>
          helloWithArgs ({helloWithArgs.status}):{' '}
          <pre>{JSON.stringify(helloWithArgs.data, null, 2)}</pre>
        </li>
      </ul>
      <div style={{ marginTop: '100px' }}>
        <a
          href="https://vercel.com/?utm_source=trpc&utm_campaign=oss"
          target="_blank"
        >
          <img
            src="/powered-by-vercel.svg"
            alt="Powered by Vercel"
            height={25}
          />
        </a>
      </div>
    </>
  );
}

import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/index.css';

const App = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <Head>
        <title>tRPC</title>
      </Head>
      <main>
        <Component {...pageProps} />
      </main>
    </>
  );
};

export default App;

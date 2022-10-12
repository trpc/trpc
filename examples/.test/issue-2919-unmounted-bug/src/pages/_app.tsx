import type { AppProps } from 'next/app'
import Link from 'next/link'
import '../styles/globals.css'
import { trpc } from '../util/trpc'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <main className="h-full">
      <span
        style={{ background: 'lightgrey', margin: '20px', padding: '10px' }}
      >
        <Link href="/">Home</Link>
      </span>

      {/* WEIRD: uncommenting one of the following also makes the error go away */}

      {/* <span
        style={{ background: 'lightgrey', margin: '20px', padding: '10px' }}
      >
        <Link href="/user/123">Dynamic subroute</Link>
      </span> */}

      {/* This route uses getStaticProps. */}

      {/* <span
        style={{ background: 'lightgrey', margin: '20px', padding: '10px' }}
      >
        <Link href="/user/123">Dynamic subroute (getStaticProps)</Link>
      </span> */}

      {/* This route uses getServerSideProps. */}

      <span
        style={{ background: 'lightgrey', margin: '20px', padding: '10px' }}
      >
        <Link href="/user-gssp/123">Dynamic subroute (getServerSideProps)</Link>
      </span>

      {/* OPTION 1 (error): Not wrapped in div */}
      <Component {...pageProps} />

      {/* OPTION 2 (no error): Wrapped in div */}
      {/* <div>
        <Component {...pageProps} />
      </div> */}
    </main>
  )
}

export default trpc.withTRPC(MyApp)

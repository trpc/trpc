import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import React from 'react';
import { GithubStarCountButton } from '../components/GithubStarCountButton';

const features = [
  {
    title: <>🧙‍♂️&nbsp; Automatic typesafety</>,
    description: (
      <>
        Automatic typesafety & autocompletion inferred from your API-paths,
        their input&nbsp;data, &amp;&nbsp;outputs.
      </>
    ),
  },
  {
    title: <>🍃&nbsp; Light &amp; Snappy DX</>,
    description: (
      <>
        No code generation, run-time bloat, or build pipeline.{' '}
        <a href="#zero" aria-describedby="footnote-label" id="footnotes-ref">
          Zero dependencies
        </a>{' '}
        &amp; a tiny client-side footprint.
      </>
    ),
  },
  {
    title: <>🐻&nbsp; Add to existing brownfield project</>,
    description: (
      <>
        Easy to add to your existing brownfield project with adapters for
        Connect/Express/Next.js.
      </>
    ),
  },
];

function Feature({ title, description }) {
  return (
    <div className={'col col-4 p-4'}>
      <h3 className="pb-6 text-xl font-semibold">{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig } = context;

  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="End-to-end typesafe APIs made easy. Automatic typesafety & autocompletion inferred from your API-paths, their input data, &amp; outputs 🧙‍♂️"
    >
      <Head>
        <script
          async
          src="https://platform.twitter.com/widgets.js"
          charSet="utf-8"
        />
      </Head>
      <main className="container py-40 mx-auto md:py-48 lg:py-64 xl:py-80">
        <header className="flex flex-col lg:flex-row">
          <div className="flex-1">
            <h1 className="pb-3 text-2xl font-bold whitespace-pre-wrap lg:text-3xl">
              {siteConfig.tagline}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 md:text-base">
              The client doesn't import any code from the server, only a single
              TypeScript type. The import type declaration is fully erased at
              runtime. tRPC transforms this type into a fully typesafe client.
            </p>
            <div className="flex items-center gap-4 mt-6">
              <Link
                href="/docs/quickstart"
                className="inline-block px-4 py-2 text-sm font-bold text-black transition-colors rounded-lg md:text-base hover:bg-cyan-600 hover:no-underline hover:text-black bg-cyan-500"
              >
                Quickstart
              </Link>
              <GithubStarCountButton />
            </div>
          </div>
          <div className="flex-1">{/* TODO: Add new GIF here */}</div>
        </header>
      </main>
      <section>
        {features && features.length > 0 && (
          <section className="flex flex-col md:flex-row items-center py-8 px-8 md:px-0 w-full max-w-[var(--ifm-container-width-xl)] mx-auto">
            {features.map((props, idx) => (
              <Feature key={idx} {...props} />
            ))}
          </section>
        )}
      </section>
      <footer
        className={`container px-8 md:px-0 w-full max-w-[var(--ifm-container-width)] mx-auto`}
      >
        <ol className="list-decimal footnotes">
          <li id="zero">
            <code>@trpc/client</code> depends on some babel runtime helpers +
            that a <code>fetch()</code> polyfill/ponyfill is used if the browser
            doesn&apos;t support it. <code>@trpc/react</code> is built on top of{' '}
            <a
              className="no-underline text-primary"
              href="https://react-query.tanstack.com/"
            >
              react-query
            </a>
            .
          </li>
        </ol>
      </footer>
    </Layout>
  );
}

export default Home;

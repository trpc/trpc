import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import React from 'react';
import GitHubButton from 'react-github-btn';
import styles from './styles.module.css';

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
      <h3 className="font-semibold text-xl pb-6">{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig } = context;

  return (
    <Layout
      title={`${siteConfig.title} - End-to-end typesafe APIs made easy`}
      description="Automatic typesafety & autocompletion inferred from your API-paths, their input data, &amp; outputs 🧙‍♂️"
    >
      <Head>
        <script
          async
          src="https://platform.twitter.com/widgets.js"
          charSet="utf-8"
        />
      </Head>
      <header className={clsx('hero hero--primary', styles.heroBanner)}>
        <div className="container flex flex-col gap-6">
          <h1 className="font-bold text-5xl">{siteConfig.title}</h1>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <p>
            <GitHubButton
              href="https://github.com/trpc/trpc"
              data-icon="octicon-star"
              data-size="large"
              data-show-count="true"
              aria-label="Star trpc/trpc on GitHub"
            >
              Star
            </GitHubButton>
          </p>

          <figure className={`${styles.figure} gap-4`}>
            <img
              className="mx-auto"
              src="https://storage.googleapis.com/trpc/trpcgif.gif"
              alt="Server/client example"
            />
            <figcaption>
              The client doesn&apos;t import <em>any code</em> from the server,
              only a single TypeScript type. The <code>import type</code>{' '}
              declaration is{' '}
              <a href="https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export">
                fully erased
              </a>{' '}
              at runtime. tRPC transforms this type into a fully typesafe
              client.
            </figcaption>
          </figure>
          <p>
            <Link
              className={clsx('getStarted', styles.getStarted)}
              to={useBaseUrl('docs/')}
            >
              Get Started
            </Link>
          </p>
        </div>
      </header>
      <main>
        {features && features.length > 0 && (
          <section className="flex flex-col md:flex-row items-center py-8 px-8 md:px-0 w-full max-w-[var(--ifm-container-width-xl)] mx-auto">
            {features.map((props, idx) => (
              <Feature key={idx} {...props} />
            ))}
          </section>
        )}

        <ol className="footnotes list-decimal">
          <li id="zero">
            <code>@trpc/client</code> depends on some babel runtime helpers +
            that a <code>fetch()</code> polyfill/ponyfill is used if the browser
            doesn&apos;t support it. <code>@trpc/react</code> is built on top of{' '}
            <a
              className="text-primary no-underline"
              href="https://react-query.tanstack.com/"
            >
              react-query
            </a>
            .
          </li>
        </ol>
        <section className="flex flex-col justify-center items-center p-4">
          <h3 className="text-2xl mb-4">What people are saying</h3>
          <div className="w-[500px] max-w-full">
            <a
              className="twitter-timeline"
              data-width="500"
              data-height="1000"
              href="https://twitter.com/alexdotjs/timelines/1441435105910796291?ref_src=twsrc%5Etfw"
            >
              tRPC love
            </a>{' '}
            <script
              async
              src="https://platform.twitter.com/widgets.js"
              charSet="utf-8"
            ></script>
          </div>
        </section>
      </main>
    </Layout>
  );
}

export default Home;

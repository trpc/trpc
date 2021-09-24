import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';
import Head from '@docusaurus/Head';
import useThemeContext from '@theme/hooks/useThemeContext';

const features = [
  {
    title: <>🧙‍♂️&nbsp; Automatic typesafety</>,
    // imageUrl: 'img/undraw_docusaurus_mountain.svg',
    description: (
      <>
        Automatic typesafety & autocompletion inferred from your API-paths,
        their input&nbsp;data, &amp;&nbsp;outputs.
      </>
    ),
  },
  {
    title: <>🍃&nbsp; Light &amp; Snappy DX</>,
    // imageUrl: 'img/undraw_docusaurus_react.svg',
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
    // imageUrl: 'img/undraw_docusaurus_tree.svg',
    description: (
      <>
        Easy to add to your existing brownfield project with adapters for
        Connect/Express/Next.js.
      </>
    ),
  },
];

function Feature({ imageUrl, title, description }) {
  const imgUrl = useBaseUrl(imageUrl);
  return (
    <div className={clsx('col col--4', styles.feature)}>
      {imgUrl && (
        <div className="text--center">
          <img className={styles.featureImage} src={imgUrl} alt={title} />
        </div>
      )}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

const Logo = () => {
  const { isDarkTheme } = useThemeContext();

  return (
    <img
      src={isDarkTheme ? '/img/logo-block.svg' : '/img/logo-block.svg'}
      height={400}
    />
  );
};

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;

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
        <style>
          {/* Hides navbar */}
          {`
          .navbar {
            display: none
          }`}
        </style>
      </Head>
      <header>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
              width: '100vw',

              backgroundImage: 'url(/img/backdrop.svg)',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: 20,
                fontWeight: 'bold',
                display: 'flex',
              }}
            >
              <a href="/docs">Docs</a>
            </div>
            <h1 className="hero__title" style={{ display: 'none' }}>
              {siteConfig.title}
            </h1>
            <div style={{ marginTop: '3rem' }} />
            <Logo />
            <p className="hero__subtitle" style={{ paddingTop: '1rem' }}>
              {siteConfig.tagline}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
              maxWidth: '60rem',
            }}
          >
            <figure className={styles.figure}>
              <img
                src="https://storage.googleapis.com/trpc/trpcgif.gif"
                alt="Server/client example"
              />
              <figcaption>
                The client above is <strong>not</strong> importing any code from
                the server, only its type declarations. <code>import type</code>{' '}
                only imports declarations to be used annotations and
                declarations. It{' '}
                <a href="https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export">
                  always gets fully erased
                </a>
                , so there’s no remnant of it at runtime.
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
        </div>
      </header>
      <main>
        {features && features.length > 0 && (
          <>
            <section className={styles.features}>
              <div className="container">
                <div className="row">
                  {features.map((props, idx) => (
                    <Feature key={idx} {...props} />
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <footer className={`container ${styles.container}`}>
        <ol className="footnotes">
          <li id="zero">
            <code>@trpc/client</code> depends on some babel runtime helpers +
            that a <code>fetch()</code> polyfill/ponyfill is used if the browser
            doesn&apos;t support it. <code>@trpc/react</code> is built on top of{' '}
            <a href="https://react-query.tanstack.com/">react-query</a>.
          </li>
        </ol>
      </footer>
    </Layout>
  );
}

export default Home;

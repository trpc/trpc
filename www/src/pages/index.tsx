import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import React, { useEffect, useState } from 'react';
import { Features } from '../components/Features';
import { GithubStarCountButton } from '../components/GithubStarCountButton';
import { Preview } from '../components/Preview';
import { SectionTitle } from '../components/SectionTitle';
import { TwitterWall } from '../components/TwitterWall';
import { Sponsors } from '../components/sponsors';

type Version = 'current' | '9.x';

/**
 * Hack to get the selected version of the page from local storage
 */
function useLocalStorageVersion() {
  const [version, setVersion] = useState<Version>(() => {
    if (typeof window === 'undefined') {
      return '9.x';
    }
    return (window.localStorage.getItem('docs-preferred-version-default') ||
      '9.x') as Version;
  });

  return {
    active: version,
    set(value: Version) {
      setVersion(value as Version);
      window.localStorage.setItem('docs-preferred-version-default', value);
    },
  };
}

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig } = context;

  const version = useLocalStorageVersion();

  const location = useLocation();
  useEffect(() => {
    if (location.search.includes('v10') && version.active !== 'current') {
      version.set('current');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, version.active]);

  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="End-to-end typesafe APIs made easy. Automatic typesafety & autocompletion inferred from your API-paths, their input data, &amp; outputs 🧙‍♂️"
    >
      <Head>
        <body className="homepage" />
        <html className={version.active === 'current' ? 'v10' : 'v9'} />
        <script
          async
          src="https://platform.twitter.com/widgets.js"
          charSet="utf-8"
        />
      </Head>
      <main className="container px-6 mx-auto space-y-28">
        <header className="pt-12 lg:pt-16 xl:pt-24">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight text-center whitespace-pre-wrap md:text-3xl lg:text-4xl xl:text-5xl">
              {siteConfig.tagline}
            </h1>
            <p className="pt-3 text-sm text-center text-gray-600 md:text-base dark:text-gray-400">
              Leverage the full power of TypeScript whilst allowing your code to
              be simpler.
            </p>
            <div className="flex items-center justify-center gap-4 mt-6">
              <Link
                href="/docs/v9/quickstart"
                className="inline-block px-4 py-2 text-sm font-bold text-white transition-colors rounded-lg shadow-xl md:text-base hover:bg-primary-darker hover:no-underline hover:text-white bg-primary"
              >
                Quickstart
              </Link>
              <GithubStarCountButton />
            </div>
            <Preview />
          </div>
        </header>

        <section>
          <Features />
        </section>
        <section className="max-w-[80ch] px-6 mx-auto md:px-0">
          <SectionTitle title={<>You may not need a traditional API</>} />
          <blockquote
            cite="https://twitter.com/alexdotjs"
            className="py-2 mt-6 space-y-2"
          >
            <p className="text-sm text-gray-600 md:text-base dark:text-gray-400">
              I built tRPC to allow me to <strong>move faster</strong> by
              removing the need of a traditional API-layer, while still having
              confidence that my apps won&apos;t break as I rapidly iterate.
            </p>
            <p className="text-sm text-gray-600 md:text-base dark:text-gray-400">
              Try it out for yourself and let us know what you think!
            </p>
          </blockquote>
          <a
            className="flex items-center gap-3 pt-6 group hover:no-underline"
            href="http://twitter.com/alexdotjs"
          >
            <img
              src="https://avatars.githubusercontent.com/u/459267?v=4"
              alt="Alex/KATT"
              loading="lazy"
              className="w-12 h-12 mr-2 rounded-full md:w-14 md:h-14"
            />
            <div>
              <h3 className="mb-0 text-base font-bold md:text-lg">Alex/KATT</h3>
              <p className="text-xs text-gray-600 md:text-sm dark:text-gray-400">
                Creator of tRPC
              </p>
            </div>
          </a>
        </section>
        <section>
          <SectionTitle title="Don't take our word for it!" />
          <TwitterWall />
        </section>
        <section className="pb-12">
          <SectionTitle
            title="Sponsors"
            description={
              <>
                We really love all of our amazing{' '}
                <a
                  href="https://github.com/sponsors/KATT"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  sponsors
                </a>
                , who help make sure tRPC is here to stay.
              </>
            }
          />
          <div className="max-w-screen-md mx-auto">
            <div className="mt-3 aspect-square">
              <Sponsors />
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

export default Home;

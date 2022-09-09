import Head from '@docusaurus/Head';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import React, { useEffect, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { Button } from '../components/Button';
import { Features } from '../components/Features';
import { GithubStarsButton } from '../components/GithubStarsButton';
import { Preview } from '../components/Preview';
import { SectionTitle } from '../components/SectionTitle';
import { TopSponsors } from '../components/TopSponsors';
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

const usePrefferedTheme = () => {
  const darkTheme = 'dark';
  const lightTheme = 'light';

  React.useEffect(() => {
    const mediaMatch = window.matchMedia('(prefers-color-scheme: dark)');
    const htmlElement = document.querySelector('html');

    const colorSchemeChangeListener = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? darkTheme : lightTheme;
      htmlElement?.setAttribute('data-theme', newTheme);
      console.log('setting theme to', newTheme);
    };

    mediaMatch.addEventListener('change', colorSchemeChangeListener);

    return () => {
      mediaMatch.removeEventListener('change', colorSchemeChangeListener);
    };
  }, []);
};

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig } = context;

  const version = useLocalStorageVersion();
  usePrefferedTheme();

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
        <header className="pt-12 lg:pt-16 xl:pt-24 max-w-[66ch] mx-auto text-center">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-center whitespace-pre-wrap md:text-3xl lg:text-4xl xl:text-5xl">
            {siteConfig.tagline}
          </h1>
          <p className="pt-3 text-sm font-medium text-center text-gray-600 md:text-lg dark:text-gray-400">
            Experience the full power of{' '}
            <span className="underline text-slate-900 dark:text-slate-100 decoration-rose-500 underline-offset-2 decoration-wavy decoration-from-font">
              TypeScript
            </span>{' '}
            inference and boost productivity while building your next full-stack
            application.
          </p>
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="flex-1 flex justify-end">
              <GithubStarsButton />
            </div>
            <div className="flex-1 flex justify-start">
              <Button
                primary
                href={`/docs/${
                  version.active === '9.x' ? 'v9' : 'v10'
                }/quickstart`}
                className="text-lg"
              >
                Quickstart
                <FiArrowRight size={20} strokeWidth={3} />
              </Button>
            </div>
          </div>
          <Preview />
          <TopSponsors />
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
            title="All Sponsors"
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
            <div className="my-3 aspect-square">
              <Sponsors />
            </div>
            <div className="flex justify-center">
              <Button primary href="https://github.com/sponsors/KATT">
                Become a sponsor!
              </Button>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

export default Home;

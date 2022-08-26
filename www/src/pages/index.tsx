import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import React from 'react';
import { Features } from '../components/Features';
import { GithubStarCountButton } from '../components/GithubStarCountButton';
import { SectionTitle } from '../components/SectionTitle';
import { TwitterWall } from '../components/TwitterWall';
import { Sponsors } from '../components/sponsors';

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig } = context;

  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="End-to-end typesafe APIs made easy. Automatic typesafety & autocompletion inferred from your API-paths, their input data, &amp; outputs 🧙‍♂️"
    >
      <Head>
        <body className="homepage" />
        <script
          async
          src="https://platform.twitter.com/widgets.js"
          charSet="utf-8"
        />
      </Head>
      <main className="container px-6 mx-auto pt-28 md:pt-40 lg:pt-48 xl:pt-64 space-y-28">
        <header className="flex flex-col lg:flex-row">
          <div className="flex-1">
            <h1 className="pb-3 text-2xl font-bold whitespace-pre-wrap lg:text-3xl">
              {siteConfig.tagline}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 md:text-base">
              Leverage the full power of TypeScript whilst allowing your code to
              be simpler.
              {/* FIXME: write something good */}
            </p>
            <div className="flex items-center gap-4 mt-6">
              <Link
                href="/docs/quickstart"
                className="inline-block px-4 py-2 text-sm font-bold text-black transition-colors rounded-lg md:text-base hover:bg-primary-darker hover:no-underline hover:text-black bg-primary shadow-xl"
              >
                Quickstart
              </Link>
              <GithubStarCountButton />
            </div>
          </div>
          <div className="flex-1 py-4 lg:p-0">
            <img
              src="https://user-images.githubusercontent.com/51714798/186850605-7cb9f6b2-2230-4eb7-981b-0b90ee1f8ffa.gif"
              alt="Demo"
            />
          </div>
        </header>

        <section>
          <Features />
        </section>
        <section className="max-w-[80ch] px-6 mx-auto md:px-0">
          <SectionTitle title={<>You may not need a traditional API</>} />
          <blockquote cite="https://twitter.com/alexdotjs" className="mt-6">
            <p className="pt-3 text-sm text-gray-600 md:text-base dark:text-gray-400">
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
                We couldn&apos;t have done it without all of our amazing{' '}
                <a
                  href="https://github.com/sponsors/KATT"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  sponsors
                </a>
                , who help us to keep tRPC alive and well-funded.
              </>
            }
          />
          <div className="max-w-screen-md mx-auto">
            <div className="aspect-square mt-3">
              <Sponsors />
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

export default Home;

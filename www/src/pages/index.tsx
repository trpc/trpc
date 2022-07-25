import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import React from 'react';
import { Features } from '../components/Features';
import { GithubStarCountButton } from '../components/GithubStarCountButton';
import { SectionTitle } from '../components/SectionTitle';
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
        <script
          async
          src="https://platform.twitter.com/widgets.js"
          charSet="utf-8"
        />
      </Head>
      <main className="container px-6 mx-auto py-28 md:py-40 lg:py-48 xl:py-64 space-y-28">
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
                className="inline-block px-4 py-2 text-sm font-bold text-black transition-colors rounded-lg md:text-base hover:bg-cyan-600 hover:no-underline hover:text-black bg-cyan-500"
              >
                Quickstart
              </Link>
              <GithubStarCountButton />
            </div>
          </div>
          <div className="flex-1">{/* TODO: Add new GIF here */}</div>
        </header>

        <section>
          {/* <SectionTitle
          title="The easy way to build typesafe APIs"
          description={
            <>
              If your project is built with TypeScript end-to-end, you can share
              types directly between your client and server, without relying on
              code generation.
            </>
          }
        /> */}
          <Features />
        </section>
        <section className="max-w-[80ch] px-6 mx-auto md:px-0">
          <blockquote cite="https://twitter.com/alexdotjs">
            <SectionTitle title={<>You may not need a traditional API</>} />
            <p className="pt-3 text-sm text-gray-600 md:text-base dark:text-gray-400">
              If we have a project that is built with the same language
              end-to-end, why should we need to bring in <em>another</em>{' '}
              language into the mix, like <code>.yaml</code> or{' '}
              <code>.graphql</code>, when all the type information is already
              there? At the end of the day, what you want to achieve with an
              &quot;API contract&quot;, whether it&apos;s a REST or a GraphQL,
              is to provide a consistent, typesafe, and secure way to
              communicate between your client and server &mdash; tRPC enables
              that without glueing together tooling from a number of different
              projects.
            </p>

            <p className="pt-3 text-sm text-gray-600 md:text-base dark:text-gray-400">
              I built tRPC to allow me to <strong>move faster</strong> by
              removing the need of a traditional API-layer, while still having
              confidence that my apps won&apos;t break as I rapidly iterate.
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
        <div className="lg:max-w-screen-lg px-4 mx-auto">
          <div className="aspect-square">
            <Sponsors />
          </div>
        </div>
      </main>
    </Layout>
  );
}

export default Home;

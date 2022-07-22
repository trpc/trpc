import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import React from 'react';
import { Features } from '../components/Features';
import { GithubStarCountButton } from '../components/GithubStarCountButton';
import { SectionTitle } from '../components/SectionTitle';

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
      <main className="container px-6 mx-auto py-28 md:py-40 lg:py-48 xl:py-64">
        <header className="flex flex-col lg:flex-row">
          <div className="flex-1">
            <h1 className="pb-3 text-2xl font-bold whitespace-pre-wrap lg:text-3xl">
              {siteConfig.tagline}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 md:text-base">
              The client doesn&apos;t import any code from the server, only a
              single TypeScript type. The import type declaration is fully
              erased at runtime. tRPC transforms this type into a fully typesafe
              client.
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
      <section className="pb-28">
        <SectionTitle
          title="The easy way to build typesafe APIs"
          description="If your project is built with full-stack TypeScript, you can share types directly between your client and server, without relying on code generation."
        />
        <Features />
      </section>
      <section className="max-w-[80ch] px-6 mx-auto md:px-0 pb-28">
        <SectionTitle title="Typesafety without the boilerplate" />
        <p className="pt-3 text-sm text-gray-600 md:text-base dark:text-gray-400">
          Diam volutpat commodo sed egestas egestas fringilla phasellus
          faucibus. Vitae sapien pellentesque habitant morbi tristique. Dapibus
          ultrices in iaculis nunc sed. Risus sed vulputate odio ut enim blandit
          volutpat maecenas volutpat. Amet consectetur adipiscing elit ut
          aliquam purus sit. Condimentum mattis pellentesque id nibh. Odio morbi
          quis commodo odio aenean.
          <div className="block h-4" />
          Consectetur adipiscing elit pellentesque habitant morbi tristique
          senectus. Eget mi proin sed libero enim sed. Faucibus et molestie ac
          feugiat sed lectus vestibulum mattis. Praesent semper feugiat nibh sed
          pulvinar proin gravida hendrerit lectus. Eu turpis egestas pretium
          aenean pharetra magna. Volutpat blandit aliquam etiapm erat velit
          scelerisque in dictum non. <div className="block h-4" />
          <strong className="text-cyan-500">
            tRPC is the solution you&apos;ve been looking for
          </strong>{' '}
          pellentesque eu tincidunt tortor aliquam. Placerat orci nulla
          pellentesque dignissim.
        </p>
        <div className="flex items-center gap-3 pt-6">
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
        </div>
      </section>
    </Layout>
  );
}

export default Home;

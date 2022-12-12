import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import React, { ComponentPropsWithoutRef, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { Button } from '../components/Button';
import { Features } from '../components/Features';
import { GithubSponsorButton } from '../components/GithubSponsorButton';
import { GithubStarsButton } from '../components/GithubStarsButton';
import { Preview } from '../components/Preview';
import { QuickIntro } from '../components/QuickIntro';
import { SectionTitle } from '../components/SectionTitle';
import { TwitterWall } from '../components/TwitterWall';
import { SponsorBubbles } from '../components/sponsors/SponsorBubbles';
import { TopSponsors } from '../components/sponsors/TopSponsors';

function searchParams(obj: Record<string, string | string[]>): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];

      return values.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
    })
    .join('&');
}

const Iframe = (
  props: Omit<ComponentPropsWithoutRef<'iframe'>, 'className'>,
) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <iframe
      loading="lazy"
      {...props}
      onLoad={() => {
        setLoaded(true);
      }}
      className={clsx(
        'w-full h-full absolute transition-opacity transition-1000',
        loaded ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
};

const HomeContent: React.FC = () => {
  const { siteConfig } = useDocusaurusContext();

  return (
    <main className="container px-6 mx-auto space-y-28">
      <header className="pt-12 mx-auto text-center lg:pt-16 xl:pt-24">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-center whitespace-pre-wrap md:text-3xl lg:text-4xl xl:text-5xl">
          {siteConfig.tagline}
        </h1>
        <p className="pt-3 text-sm font-medium text-center max-w-[60ch] text-gray-600 md:text-lg dark:text-gray-400 mx-auto">
          Experience the full power of{' '}
          <span className="underline text-slate-900 dark:text-slate-100 decoration-rose-500 underline-offset-2 decoration-wavy decoration-from-font">
            TypeScript
          </span>{' '}
          inference to boost productivity <br /> for your full-stack
          application.
        </p>
        <div className="flex items-center justify-center gap-4 mt-6">
          <div className="flex justify-end flex-1">
            <GithubStarsButton className="lg:text-lg" />
          </div>
          <div className="flex justify-start flex-1">
            <Button
              variant="primary"
              href="/docs/quickstart"
              className="lg:text-lg"
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

      <section
        className={clsx(
          'border border-gray-100 rounded-xl p-4 md:p-8 shadow-lg dark:shadow-lg dark:shadow-gray-900 dark:border-gray-900',
        )}
      >
        <QuickIntro />
      </section>

      <section className={'mx-auto max-w-[1600px] hidden md:block'}>
        <SectionTitle
          id="try-it-out"
          title={<>Try it out for yourself!</>}
          description={
            <>
              This is a minimal full-stack React application using tRPC and
              Next.js.
            </>
          }
        />
        <div
          className={clsx(
            'h-[600px] w-full rounded-xl overflow-hidden z-10 relative my-4',
          )}
        >
          <div className="absolute inset-0 bg-gray-900 animate-pulse" />
          <Iframe
            src={
              `https://stackblitz.com/github/trpc/trpc/tree/main/examples/next-minimal-starter?` +
              searchParams({
                embed: '1',
                file: [
                  // Opens these side-by-side
                  'src/pages/index.tsx',
                  'src/pages/api/trpc/[trpc].ts',
                ],
                hideNavigation: '1',
                terminalHeight: '1',
                showSidebar: '0',
                view: 'editor',
              })
            }
            frameBorder="0"
          />
        </div>
        <div className="flex justify-center">
          <Button
            variant="tertiary"
            href="https://github.com/trpc/next-minimal-starter/generate"
          >
            <svg
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              className="fill-[#181717] dark:fill-white h-5 pr-1"
            >
              <title>GitHub</title>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            <span className="mx-auto font-semibold no-underline dark:text-zinc-300 text-zinc-900">
              Use this template
            </span>
          </Button>
        </div>
      </section>

      <section className="max-w-[80ch] px-6 mx-auto md:px-0">
        <SectionTitle
          id="quote"
          title={<>You may not need a traditional API</>}
        />
        <blockquote
          cite="https://twitter.com/alexdotjs"
          className="py-2 mt-3 space-y-2 italic"
        >
          <p className="text-sm text-gray-600 md:text-base dark:text-gray-400">
            I built tRPC to allow people to <strong>move faster</strong> by
            removing the need of a traditional API-layer, while still having
            confidence that our apps won&apos;t break as we rapidly iterate.
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
        <SectionTitle
          id="twitter-wall"
          title="Don't take our word for it!"
          description="Many developers are loving tRPC and what it brings to them."
        />
        <TwitterWall />
      </section>
      <section className="pb-12">
        <SectionTitle
          id="all-sponsors"
          title="All Sponsors"
          description={
            <>
              We really love all of our amazing{' '}
              <a
                href="https://trpc.io/sponsor"
                target="_blank"
                rel="noreferrer noopener"
              >
                sponsors
              </a>
              &nbsp;who help make sure tRPC is here to stay.
            </>
          }
        />
        <div className="max-w-screen-md mx-auto">
          <div className="my-3 aspect-square">
            <SponsorBubbles />
          </div>
          <div className="flex justify-center">
            <GithubSponsorButton />
          </div>
        </div>
      </section>
    </main>
  );
};

const HomeHead: React.FC = () => {
  return (
    <Head>
      <body className="homepage" />
      <script async src="https://platform.twitter.com/widgets.js" />
      <link
        rel="preload"
        href="https://assets.trpc.io/www/v10/v10-dark-landscape.png"
        as="image"
      />
      <link
        rel="preload"
        href="https://assets.trpc.io/www/v10/preview-dark.png"
        as="image"
      />
    </Head>
  );
};

const HomePage: React.FC = () => {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="End-to-end typesafe APIs made easy. Automatic typesafety & autocompletion inferred from your API-paths, their input data, &amp; outputs 🧙‍♂️"
    >
      <HomeHead />
      <HomeContent />
    </Layout>
  );
};
export default HomePage;

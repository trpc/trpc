import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import React, { ComponentPropsWithoutRef, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { popIn } from '../animations/popIn';
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
import { searchParams } from '../utils/searchParams';

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
        'absolute h-full w-full transition-opacity duration-1000',
        loaded ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
};

const HomeContent: React.FC = () => {
  const { siteConfig } = useDocusaurusContext();

  return (
    <main className="container mx-auto space-y-28 px-6">
      <header className="mx-auto pt-12 text-center lg:pt-16 xl:pt-24">
        <div>
          <h1 className="whitespace-pre-wrap text-center text-2xl font-extrabold leading-tight tracking-tight md:text-3xl lg:text-4xl xl:text-5xl">
            {siteConfig.tagline}
          </h1>
          <p className="mx-auto max-w-[60ch] pt-3 text-center text-sm font-medium text-zinc-600 dark:text-zinc-300 md:text-lg">
            Experience the full power of{' '}
            <span className="text-slate-900 underline decoration-rose-500 decoration-wavy decoration-from-font underline-offset-2 dark:text-slate-100">
              TypeScript
            </span>{' '}
            inference to boost productivity <br /> for your full-stack
            application.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex flex-1 justify-end">
              <GithubStarsButton className="lg:text-lg" />
            </div>
            <div className="flex flex-1 justify-start">
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
        </div>
        <div>
          <Preview />
        </div>
        <div>
          <TopSponsors />
        </div>
      </header>

      <motion.section
        variants={popIn}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Features />
      </motion.section>

      <section className="py-4 md:py-8">
        <QuickIntro />
      </section>

      <section className={'mx-auto hidden max-w-[1600px] md:block'}>
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
        <motion.div
          variants={popIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className={clsx(
            'relative z-10 my-0 h-[800px] w-full overflow-hidden rounded-xl md:my-4 lg:my-8',
          )}
        >
          <div className="absolute inset-0 animate-pulse bg-zinc-900" />
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
        </motion.div>
        <motion.div
          variants={popIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex justify-center"
        >
          <Button
            variant="tertiary"
            href="https://github.com/trpc/next-minimal-starter/generate"
          >
            <svg
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 fill-neutral-900 pr-1 dark:fill-white"
            >
              <title>GitHub</title>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            <span className="mx-auto font-semibold text-zinc-900 no-underline dark:text-zinc-300">
              Use this template
            </span>
          </Button>
        </motion.div>
      </section>

      <section className="mx-auto max-w-[80ch] px-6 md:px-0">
        <SectionTitle
          id="quote"
          title={<>You may not need a traditional API</>}
        />
        <motion.div
          variants={popIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <blockquote
            cite="https://twitter.com/alexdotjs"
            className="mt-3 space-y-2 border-none py-2 italic"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-300 md:text-base">
              &quot;I built tRPC to allow people to <strong>move faster</strong>{' '}
              by removing the need of a traditional API-layer, while still
              having confidence that our apps won&apos;t break as we rapidly
              iterate.&quot;
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 md:text-base">
              Try it out for yourself and let us know what you think!
            </p>
          </blockquote>
          <a
            className="group flex items-center gap-3 pt-6 hover:no-underline"
            href="http://twitter.com/alexdotjs"
          >
            <img
              src="https://avatars.githubusercontent.com/u/459267?v=4"
              alt="Alex/KATT"
              loading="lazy"
              className="mr-2 h-12 w-12 rounded-full md:h-14 md:w-14"
            />
            <div>
              <h3 className="mb-0 text-base font-bold md:text-lg">Alex/KATT</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 md:text-sm">
                Creator of tRPC
              </p>
            </div>
          </a>
        </motion.div>
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
        <div className="mx-auto max-w-screen-md">
          <motion.div
            variants={popIn}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="my-3 aspect-square"
          >
            <SponsorBubbles />
          </motion.div>
          <motion.div
            variants={popIn}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="flex justify-center"
          >
            <GithubSponsorButton />
          </motion.div>
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

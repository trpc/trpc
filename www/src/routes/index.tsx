import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BadgeCheck,
  BatteryFull,
  Briefcase,
  Lock,
  Sprout,
  Terminal,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { DocBody } from '~/components/doc-body.tsx';
import { GithubStarsButton } from '~/components/github-stars-button.tsx';
import { PartnerCards } from '~/components/sponsors/partners.tsx';
import { SponsorCloud } from '~/components/sponsors/sponsor-cloud.tsx';
import {
  SponsorButton,
  SupportedBy,
} from '~/components/sponsors/supported-by.tsx';
import { UsedBy } from '~/components/used-by/used-by.tsx';
import { v11Docs } from '~/content/docs.ts';
import { partners } from '~/sponsors.ts';
import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';
import { pageHead } from '~/seo.ts';
import { site } from '~/site.ts';
import v11Define from '../../v11/home/step-1.md';
import v11Serve from '../../v11/home/step-2.md';
import v11Call from '../../v11/home/step-3.md';

export const Route = createFileRoute('/')({
  head: () =>
    pageHead({
      description: site.description,
      markdownPath: '/index.md',
      path: '/',
      structuredData: [
        {
          '@type': 'WebSite',
          description: site.description,
          inLanguage: 'en',
          name: site.name,
          url: `${site.url}/`,
        },
        {
          '@type': 'SoftwareSourceCode',
          codeRepository: site.github,
          description: site.description,
          license: 'https://opensource.org/licenses/MIT',
          name: site.name,
          programmingLanguage: 'TypeScript',
        },
      ],
    }),
  component: HomePage,
});

interface Step {
  readonly body: ReactNode;
  readonly code: string;
  readonly guide: string;
  readonly id: 'call' | 'define' | 'serve';
  readonly slug: string;
  readonly title: string;
}

/** trpc.io's home page's intro (`www/src/components/QuickIntro.tsx`). */
const steps: ReadonlyArray<Step> = [
  {
    body: (
      <>
        <p>
          The first step to creating a tRPC API is to define your procedures.
        </p>
        <p>
          Procedures are the functions we will use to build your backend.
          They&apos;re <i>composable</i> and can be queries, mutations, or
          subscriptions. Routers contain multiple procedures.
        </p>
        <p>
          In this procedure, we use a{' '}
          <a href="https://github.com/colinhacks/zod">Zod</a> validator to
          ensure the input from the client has exactly the shape that our
          procedure expects. We will also return a simple text string from the
          query.
        </p>
        <p>
          At the end of the file, we export the type of the router so we can use
          it in our frontend code in just a few moments.
        </p>
      </>
    ),
    code: v11Define.html,
    guide: 'Define procedures',
    id: 'define',
    slug: 'server/procedures',
    title: 'Define your procedures',
  },
  {
    body: (
      <>
        <p>
          Next, we create our HTTP server using our <code>appRouter</code>. We
          now have a tRPC server running!
        </p>
        <p>
          tRPC has many adapters so it can meet you where you are. Next.js,
          Express, the Fetch API (Astro, Remix, SvelteKit, Cloudflare Workers,
          etc.), Fastify, AWS Lambda, or a vanilla Node HTTP server.
        </p>
      </>
    ),
    code: v11Serve.html,
    guide: 'Adapters',
    id: 'serve',
    slug: 'server/adapters',
    title: 'Create your HTTP server',
  },
  {
    body: (
      <>
        <p>
          Now that we have the server running, we can create a client and start
          querying data.
        </p>
        <p>
          We pass the <code>AppRouter</code> type when creating the client to
          give us TypeScript autocompletion and Intellisense that matches the
          backend API without requiring any code generation!
        </p>
      </>
    ),
    code: v11Call.html,
    guide: 'The vanilla client',
    id: 'call',
    slug: 'client/vanilla',
    title: 'Connect your client and start querying!',
  },
];

interface Feature {
  readonly body: ReactNode;
  readonly icon: ReactNode;
  readonly title: string;
}

/** trpc.io's home page's features (`www/src/components/Features.tsx`). */
const features: ReadonlyArray<Feature> = [
  {
    body: 'Made a server side change? TypeScript will warn you of errors on your client before you even save the file!',
    icon: <Lock />,
    title: 'Automatic typesafety',
  },
  {
    body: 'tRPC has no build or compile steps, meaning no code generation, runtime bloat or build step.',
    icon: <Zap />,
    title: 'Snappy DX',
  },
  {
    body: "Compatible with all JavaScript frameworks and runtimes. It's easy to add to your existing projects.",
    icon: <Briefcase />,
    title: 'Framework agnostic',
  },
  {
    body: "Using tRPC is like using an SDK for your API's server code, giving you confidence in your endpoints.",
    icon: <Terminal />,
    title: 'Autocompletion',
  },
  {
    body: 'tRPC has zero dependencies and a tiny client-side footprint making it lightweight.',
    icon: <Sprout />,
    title: 'Light bundle size',
  },
  {
    body: 'We provide adapters for React, Next.js, Express, Fastify, AWS Lambda, Solid, Svelte, and more.',
    icon: <BatteryFull />,
    title: 'Batteries included',
  },
];

function HashLink(props: {
  readonly children: ReactNode;
  readonly id: string;
}) {
  return (
    <a
      className="group/hash inline-flex items-center gap-2"
      href={`#${props.id}`}
    >
      {props.children}
      <span
        aria-hidden="true"
        className="text-muted-foreground opacity-0 transition-opacity group-hover/hash:opacity-100"
      >
        #
      </span>
    </a>
  );
}

const docLink =
  'inline-flex items-center gap-1 font-medium text-link underline-offset-4 hover:underline';

const proseCode =
  '[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground';

function TypeScript() {
  return (
    <span className="text-foreground underline decoration-rose-500 decoration-wavy decoration-from-font underline-offset-2">
      TypeScript
    </span>
  );
}

function HeroText() {
  const primary = cn(
    buttonVariants({ size: 'lg' }),
    'font-bold shadow-lg shadow-brand/25',
  );
  const secondary = cn(buttonVariants({ size: 'lg', variant: 'outline' }));
  return (
    <>
      <p className="max-w-xl text-lg text-pretty text-muted-foreground">
        Experience the full power of <TypeScript /> inference to boost
        productivity for your full-stack application.
      </p>
      <div className="flex flex-wrap gap-3">
        <GithubStarsButton className={secondary} />
        <Link
          className={primary}
          params={{ _splat: 'quickstart' }}
          to={v11Docs.route}
        >
          Quickstart <ArrowRight />
        </Link>
      </div>
      <p className="font-mono text-sm text-muted-foreground">
        <span className="select-none">$ </span>pnpm add @trpc/server
        @trpc/client
      </p>
    </>
  );
}

function Steps() {
  return (
    <ol className="grid gap-16">
      {steps.map((step, index) => (
        <li
          className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12"
          id={step.id}
          key={step.id}
        >
          <div className="grid content-start gap-4 lg:sticky lg:top-32">
            <h3 className="flex items-center gap-3 text-xl font-bold tracking-tight">
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm text-primary-foreground"
              >
                {index + 1}
              </span>
              <HashLink id={step.id}>{step.title}</HashLink>
            </h3>
            <div
              className={cn(
                'grid gap-3 text-muted-foreground [&_a]:font-medium [&_a]:text-link [&_a]:underline-offset-4 [&_a:hover]:underline',
                proseCode,
              )}
            >
              {step.body}
            </div>
            <Link
              className={`${docLink} w-fit text-sm`}
              params={{ _splat: step.slug }}
              to={v11Docs.route}
            >
              {step.guide} <ArrowRight className="inline size-4" />
            </Link>
          </div>
          <DocBody className="min-w-0 [&_.code-block]:my-0!" html={step.code} />
        </li>
      ))}
    </ol>
  );
}

const featureCard =
  'grid h-full content-start gap-2 rounded-xl border bg-card p-5 [&_svg]:size-5';

function Features() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => (
        <li key={feature.title}>
          <div className={featureCard}>
            <span className="text-primary">{feature.icon}</span>
            <span className="font-semibold">{feature.title}</span>
            <span className={cn('text-sm text-muted-foreground', proseCode)}>
              {feature.body}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function HomePage() {
  const showPartners = partners.length > 0;
  return (
    <main>
      {/* `clip`, unlike `hidden`, keeps the sticky column sticky. */}
      <section className="relative overflow-x-clip border-b">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden [background-image:radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-brand/20 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:py-24">
          <div className="grid gap-6 lg:sticky lg:top-28">
            <Badge className="w-fit" variant="outline">
              <BadgeCheck /> v11 · stable
            </Badge>
            <h1 className="grid gap-3 font-extrabold tracking-tight text-balance">
              <span className="text-4xl sm:text-5xl lg:text-6xl">
                {site.tagline[0]}
              </span>
              <span className="text-2xl text-brand sm:text-3xl">
                {site.tagline[1]}
              </span>
            </h1>
            <HeroText />
            <SupportedBy />
          </div>
          <div
            className="relative grid min-w-0 grid-cols-1 gap-3"
            id="hero-code"
          >
            <DocBody
              className="min-w-0 [&_.code-block]:my-0! [&_.code-block]:shadow-[0_-24px_300px_0_rgb(57_140_203/0.15)]"
              html={v11Call.html}
            />
            <p className="text-sm text-muted-foreground">
              The client of the router{' '}
              <a className={docLink} href="#define">
                below
              </a>
              : the types come from the server, with nothing generated.
            </p>
          </div>
        </div>
      </section>

      <UsedBy />

      <section
        aria-labelledby="how-it-works"
        className="mx-auto max-w-7xl border-b px-4 py-16 sm:px-6"
      >
        <h2
          className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
          id="how-it-works"
        >
          <HashLink id="how-it-works">How it works</HashLink>
        </h2>
        <p className="mb-12 max-w-2xl text-muted-foreground">
          It&apos;s quick and easy to get started with tRPC to build a typesafe
          API.
        </p>
        <Steps />
      </section>

      <section
        aria-labelledby="features"
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6"
      >
        <h2
          className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
          id="features"
        >
          <HashLink id="features">Features</HashLink>
        </h2>
        <div className="mt-8">
          <Features />
        </div>
      </section>

      <section
        aria-labelledby="sponsors"
        className="mx-auto max-w-7xl border-t px-4 py-16 sm:px-6"
      >
        <div className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h2
              className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
              id="sponsors"
            >
              <HashLink id="sponsors">Sponsors</HashLink>
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              tRPC is MIT licensed and built in the open, kept going by the
              companies and people below. Thank you!
            </p>
          </div>
          <SponsorButton />
        </div>
        {showPartners ? <PartnerCards /> : null}
        <SponsorCloud
          className={cn('mx-auto max-w-3xl', showPartners && 'mt-12')}
        />
      </section>
    </main>
  );
}

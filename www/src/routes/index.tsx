import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BadgeCheck,
  BatteryFull,
  Blocks,
  Briefcase,
  Cable,
  FileJson,
  Globe,
  History,
  Lock,
  Radio,
  ShieldCheck,
  Sparkles,
  Sprout,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import call from 'sample:home/src/client.ts#call';
import hero from 'sample:home/src/client.ts#hero';
import procedure from 'sample:home/src/server.ts#procedure';
import serve from 'sample:home/src/server.ts#serve';

import { DocBody } from '~/components/doc-body.tsx';
import { HomeVersionBar } from '~/components/home-version-bar.tsx';
import { PartnerCards } from '~/components/sponsors/partners.tsx';
import { SponsorCloud } from '~/components/sponsors/sponsor-cloud.tsx';
import {
  SponsorButton,
  SupportedBy,
} from '~/components/sponsors/supported-by.tsx';
import { UsedBy } from '~/components/used-by/used-by.tsx';
import { findDoc, homeDocs } from '~/content/docs.ts';
import {
  allHomeVersions,
  defaultHomeVersion,
  type HomeVersion,
  homeVersionOf,
  syncHomeVersionAttribute,
  useV12Shown,
  validateHomeSearch,
} from '~/home-version.ts';
import { partners } from '~/sponsors.ts';
import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';
import { pageHead } from '~/seo.ts';
import { site, v12 } from '~/site.ts';
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
  validateSearch: validateHomeSearch,
});

interface Step {
  readonly body: ReactNode;
  readonly code: string;
  readonly guide: string;
  /** Each version's steps share their ids; the shown one has them. */
  readonly id: 'call' | 'define' | 'serve';
  readonly slug: string;
  readonly title: string;
}

/** trpc.io's home page's intro (`www/src/components/QuickIntro.tsx`). */
const v11Steps: ReadonlyArray<Step> = [
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

const v12Steps: ReadonlyArray<Step> = [
  {
    body: (
      <>
        <p>
          A router is a plain object of procedures. Each one validates its input
          with any Standard Schema library and returns its output, or an error
          with typed data.
        </p>
        <p>
          Export the router&apos;s <code>type</code>: it is all the client
          needs.
        </p>
      </>
    ),
    code: procedure.html,
    guide: 'Procedures',
    id: 'define',
    slug: 'server/procedures',
    title: 'Define procedures',
  },
  {
    body: (
      <p>
        <code>createFetchHandler</code> serves the router over HTTP, SSE and
        WebSockets. Hand <code>handler.fetch</code> to Workers, Bun, Deno or a
        Next.js route, or serve it on Node with Effect&apos;s{' '}
        <code>HttpServer</code>.
      </p>
    ),
    code: serve.html,
    guide: 'Adapters',
    id: 'serve',
    slug: 'adapters/overview',
    title: 'Serve them anywhere',
  },
  {
    body: (
      <>
        <p>
          The client is typed from <code>routerType&lt;AppRouter&gt;()</code>,
          so no server code ships to the browser. Hover a name to see its type.
        </p>
        <p>
          <code>safe()</code> turns a call into a result tuple whose error lists
          every way it can fail. <code>matchError()</code> makes you handle each
          one: the procedure&apos;s errors, the ones its links can make, and{' '}
          <code>unexpected</code> for the rest.
        </p>
      </>
    ),
    code: call.html,
    guide: 'The client',
    id: 'call',
    slug: 'client/overview',
    title: 'Call them with their types',
  },
];

const stepsOf = {
  v11: v11Steps,
  v12: v12Steps,
} as const satisfies Record<HomeVersion, ReadonlyArray<Step>>;

interface Feature {
  readonly body: ReactNode;
  readonly icon: ReactNode;
  /** The page it links to, if it does: trpc.io's v11 features don't. */
  readonly slug?: string;
  readonly title: string;
}

/** trpc.io's home page's features (`www/src/components/Features.tsx`). */
const v11Features: ReadonlyArray<Feature> = [
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

const v12Features: ReadonlyArray<Feature> = [
  {
    body: 'Procedures can return an Effect, and the client can be one. Middleware, services and errors compose with the rest of your Effect app.',
    icon: <Workflow />,
    slug: 'server/effect',
    title: 'Built on Effect',
  },
  {
    body: 'Return an async iterable to stream; send and receive files and blobs. Every link batches and streams by default.',
    icon: <Cable />,
    slug: 'server/streaming',
    title: 'Streams and files',
  },
  {
    body: (
      <>
        <code>tracked()</code> events resume after a reconnect, over SSE or
        WebSockets.
      </>
    ),
    icon: <Radio />,
    slug: 'subscriptions/overview',
    title: 'Subscriptions that resume',
  },
  {
    body: 'Give a procedure a route and serve the same router as REST, with an OpenAPI document generated from its schemas or its types.',
    icon: <FileJson />,
    slug: 'openapi/routes',
    title: 'OpenAPI from the same router',
  },
  {
    body: 'Node, Bun, Deno, Cloudflare Workers, AWS Lambda, Express and Fastify.',
    icon: <Globe />,
    slug: 'adapters/overview',
    title: 'Every runtime',
  },
  {
    body: 'Query, mutation and subscription options for TanStack Query in React; Server Actions and RSC helpers.',
    icon: <Blocks />,
    slug: 'integrations/tanstack-query',
    title: 'Framework integrations',
  },
  {
    body: 'Write the contract first and implement it later, or derive one from an OpenAPI document. Clients type from the contract alone.',
    icon: <ShieldCheck />,
    slug: 'server/contract-first',
    title: 'Contract-first',
  },
  {
    body: (
      <>
        <code>createV11Handler</code> serves v11 clients from a v12 router while
        you migrate, and a codemod rewrites most of the code.
      </>
    ),
    icon: <History />,
    slug: 'migrations/from-v11',
    title: 'Migrate one step at a time',
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

/**
 * One version's part of the page; the CSS shows the version picked
 * (`[data-home-panel]`). v12's is in the HTML while it's hidden too, for a
 * session that has been to v12 (`useV12Shown`), with its links disabled
 * until then (`useLinksOff`).
 */
function Panel(props: {
  readonly children: ReactNode;
  readonly version: HomeVersion;
}) {
  return <div data-home-panel={props.version}>{props.children}</div>;
}

/** Whether `version`'s links have no `href` yet: v12's, until it's shown. */
function useLinksOff(version: HomeVersion) {
  return version === 'v12' && !useV12Shown();
}

function TypeScript() {
  return (
    <span className="text-foreground underline decoration-rose-500 decoration-wavy decoration-from-font underline-offset-2">
      TypeScript
    </span>
  );
}

function HeroText(props: { readonly version: HomeVersion }) {
  const docs = homeDocs[props.version];
  const linksOff = useLinksOff(props.version);
  const primary = cn(
    buttonVariants({ size: 'lg' }),
    'font-bold shadow-lg shadow-brand/25',
  );
  const secondary = cn(buttonVariants({ size: 'lg', variant: 'outline' }));
  if (props.version === 'v11') {
    return (
      <>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Experience the full power of <TypeScript /> inference to boost
          productivity for your full-stack application.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className={primary}
            params={{ _splat: 'quickstart' }}
            to={docs.route}
          >
            Quickstart <ArrowRight />
          </Link>
          <Link
            className={secondary}
            params={{ _splat: docs.firstDoc }}
            to={docs.route}
          >
            Read the docs
          </Link>
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          <span className="select-none">$ </span>pnpm add @trpc/server
          @trpc/client
        </p>
      </>
    );
  }
  return (
    <>
      <p className="max-w-xl text-lg text-pretty text-muted-foreground">
        Experience the full power of <TypeScript /> inference: write procedures
        on the server and call them from the client with their types. No schemas
        to generate, no code to sync. v12 is rebuilt on{' '}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href="https://effect.website"
        >
          Effect
        </a>
        , and you don&apos;t have to use it.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          className={primary}
          disabled={linksOff}
          params={{ _splat: 'getting-started' }}
          to={docs.route}
        >
          Get started <ArrowRight />
        </Link>
        <Link
          className={secondary}
          disabled={linksOff}
          params={{ _splat: 'migrations/from-v11' }}
          to={docs.route}
        >
          Migrating from v11
        </Link>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-sm text-muted-foreground">
        <span>
          <span className="select-none">$ </span>pnpm add @trpc12/trpc effect
        </span>
        <span
          className="code-unpublished static! font-sans"
          title="The @trpc12 packages aren’t published until tRPC v12 is released"
        >
          Not on npm yet
        </span>
      </p>
    </>
  );
}

function Steps(props: { readonly version: HomeVersion }) {
  const route = homeDocs[props.version].route;
  const linksOff = useLinksOff(props.version);
  return (
    <ol className="grid gap-16">
      {stepsOf[props.version].map((step, index) => (
        <li
          className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12"
          data-step-id={step.id}
          id={props.version === defaultHomeVersion ? step.id : undefined}
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
              disabled={linksOff}
              params={{ _splat: step.slug }}
              to={route}
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

function Features(props: { readonly version: HomeVersion }) {
  const docs = homeDocs[props.version];
  const route = docs.route;
  const linksOff = useLinksOff(props.version);
  // A card for an experiment's page waits, like the page, in the sidebar.
  const features = (props.version === 'v11' ? v11Features : v12Features).filter(
    (feature) =>
      feature.slug === undefined ||
      findDoc(docs, feature.slug)?.experiment === undefined,
  );
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => {
        const content = (
          <>
            <span className="text-primary">{feature.icon}</span>
            <span className="font-semibold">{feature.title}</span>
            <span className={cn('text-sm text-muted-foreground', proseCode)}>
              {feature.body}
            </span>
          </>
        );
        return (
          <li key={feature.title}>
            {feature.slug === undefined ? (
              <div className={featureCard}>{content}</div>
            ) : (
              <Link
                className={cn(
                  featureCard,
                  'transition-colors hover:border-primary/40 hover:bg-accent/50',
                )}
                disabled={linksOff}
                params={{ _splat: feature.slug }}
                to={route}
              >
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function HomePage() {
  const showPartners = partners.length > 0;
  // Client navigations (and hydration); first paint uses homeVersionScript.
  syncHomeVersionAttribute(homeVersionOf(Route.useSearch()));
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
            <Panel version="v11">
              <Badge className="w-fit" variant="outline">
                <BadgeCheck /> v11 · stable
              </Badge>
            </Panel>
            <Panel version="v12">
              <Badge className="w-fit" variant="outline">
                <Sparkles /> v12 preview
              </Badge>
            </Panel>
            <h1 className="grid gap-3 font-extrabold tracking-tight text-balance">
              <span className="text-4xl sm:text-5xl lg:text-6xl">
                {site.tagline[0]}
              </span>
              <span className="text-2xl text-brand sm:text-3xl">
                {site.tagline[1]}
              </span>
            </h1>
            {allHomeVersions.map((version) => (
              <Panel key={version} version={version}>
                <HeroText version={version} />
              </Panel>
            ))}
            <SupportedBy />
          </div>
          {/* pt-14 is the room the version pill docks in, above the code.
              Every version ships in the HTML; CSS and homeVersionScript pick.
              While v12 is hidden, neither shows until it's shown
              (`[data-v12-ui]`, `[data-v12-room]`). */}
          <div
            className="relative grid min-w-0 grid-cols-1 gap-3 pt-14"
            data-v12-room={v12.hidden ? '' : undefined}
            id="hero-code"
          >
            <HomeVersionBar />
            <Panel version="v11">
              <DocBody
                className="min-w-0 [&_.code-block]:my-0! [&_.code-block]:shadow-[0_-24px_300px_0_rgb(57_140_203/0.15)]"
                html={v11Call.html}
              />
            </Panel>
            <Panel version="v12">
              <DocBody
                className="min-w-0 [&_.code-block]:my-0! [&_.code-block]:shadow-[0_-24px_300px_0_rgb(57_140_203/0.15)]"
                html={hero.html}
              />
            </Panel>
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
        {/* Every version in the static HTML. The steps' shared ids are on
            the shown panel only (homeVersionScript, applyHomeVersion). */}
        <Panel version="v11">
          <p className="mb-12 max-w-2xl text-muted-foreground">
            It&apos;s quick and easy to get started with tRPC to build a
            typesafe API.
          </p>
          <Steps version="v11" />
        </Panel>
        <Panel version="v12">
          <p className="mb-12 max-w-2xl text-muted-foreground">
            Three files&apos; worth of code, compiled when this site builds: the
            types you hover are the ones your editor shows.
          </p>
          <Steps version="v12" />
        </Panel>
      </section>

      <section
        aria-labelledby="features"
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6"
      >
        <h2
          className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
          id="features"
        >
          <HashLink id="features">
            <span data-home-panel="v11">Features</span>
            <span data-home-panel="v12">What&apos;s in v12</span>
          </HashLink>
        </h2>
        <Panel version="v11">
          <div className="mt-8">
            <Features version="v11" />
          </div>
        </Panel>
        <Panel version="v12">
          <p className="mb-8 max-w-2xl text-muted-foreground">
            One package,{' '}
            <code className="font-mono text-[0.9em]">@trpc12/trpc</code>, with
            an entry point per job and nothing to install twice.
          </p>
          <Features version="v12" />
        </Panel>
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

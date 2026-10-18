import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Blocks,
  Cable,
  FileJson,
  Globe,
  History,
  Radio,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
import call from 'sample:home/src/client.ts#call';
import hero from 'sample:home/src/client.ts#hero';
import procedure from 'sample:home/src/server.ts#procedure';
import serve from 'sample:home/src/server.ts#serve';

import { DocBody } from '~/components/doc-body.tsx';
import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';
import { pageHead } from '~/seo.ts';
import { site } from '~/site.ts';

export const Route = createFileRoute('/')({
  head: () =>
    pageHead({
      description: site.description,
      markdownPath: '/index.md',
      path: '/',
      structuredData: [
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
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

const steps: ReadonlyArray<Step> = [
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
          <code>safe()</code> turns a call into a result tuple, with the
          procedure&apos;s defined errors narrowed by <code>code</code>.
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

interface Feature {
  readonly body: ReactNode;
  readonly icon: ReactNode;
  readonly slug: string;
  readonly title: string;
}

const features: ReadonlyArray<Feature> = [
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
        WebSockets, fed by a <code>Publisher</code> backed by Redis, Postgres or
        Durable Objects.
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
    body: 'Node, Bun, Deno, Cloudflare Workers and Durable Objects, AWS Lambda, Express, Fastify, Firebase, message ports and raw sockets.',
    icon: <Globe />,
    slug: 'adapters/overview',
    title: 'Every runtime',
  },
  {
    body: 'Query and mutation options for TanStack Query in React, Vue, Solid, Svelte, Angular, Preact and Lit; Server Actions and RSC helpers.',
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

interface Credit {
  readonly body: ReactNode;
  readonly by: ReactNode;
  readonly name: string;
  readonly url: string;
}

const credits: ReadonlyArray<Credit> = [
  {
    body: (
      <>
        Zodios pioneered schema-first APIs in TypeScript: one definition of
        every endpoint, with zod schemas, types and validates both the client
        and the server that implements it.
      </>
    ),
    by: (
      <>
        by <a href="https://github.com/ecyrbe">ecyrbe</a>
      </>
    ),
    name: 'Zodios',
    url: 'https://www.zodios.org',
  },
  {
    body: (
      <>
        trpc-openapi brought REST routes and OpenAPI documents to tRPC routers,
        declared in procedure meta, which v12&apos;s <code>route</code> meta
        carries on.{' '}
        <a href="https://github.com/mcampa/trpc-to-openapi">trpc-to-openapi</a>,
        by Mario Campa, maintains it for v11.
      </>
    ),
    by: (
      <>
        by <a href="https://github.com/jlalmes">James Berry</a>
      </>
    ),
    name: 'trpc-openapi',
    url: 'https://github.com/trpc/trpc-openapi',
  },
  {
    body: (
      <>
        ts-rest put a contract at the heart of the API: a router of routes that
        the server implements, the client calls and OpenAPI documents. oRPC
        credits it for its contract-first design.
      </>
    ),
    by: (
      <>
        by <a href="https://github.com/oliverbutler">Oliver Butler</a>
      </>
    ),
    name: 'ts-rest',
    url: 'https://ts-rest.com',
  },
  {
    body: (
      <>
        oRPC&apos;s feature table is the bar v12 measures itself against, and
        many of v12&apos;s designs follow oRPC&apos;s: contracts with{' '}
        <code>implement()</code>, OpenAPI from the same router, declared errors
        with <code>safe()</code> result tuples, lifecycle hooks, rate limits,
        locks and hibernating Durable Objects.
      </>
    ),
    by: (
      <>
        by <a href="https://github.com/dinwwwh">Định Lê</a> and{' '}
        <a href="https://github.com/middleapi">middleapi</a>
      </>
    ),
    name: 'oRPC',
    url: 'https://orpc.dev',
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

function HomePage() {
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
              <Sparkles /> v12 preview
            </Badge>
            <h1 className="grid gap-3 font-extrabold tracking-tight text-balance">
              <span className="text-4xl sm:text-5xl lg:text-6xl">
                {site.tagline[0]}
              </span>
              <span className="text-2xl text-brand sm:text-3xl">
                {site.tagline[1]}
              </span>
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              Experience the full power of{' '}
              <span className="text-foreground underline decoration-rose-500 decoration-wavy decoration-from-font underline-offset-2">
                TypeScript
              </span>{' '}
              inference: write procedures on the server and call them from the
              client with their types. No schemas to generate, no code to sync.
              v12 is rebuilt on{' '}
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
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'font-bold shadow-lg shadow-brand/25',
                )}
                params={{ _splat: 'getting-started' }}
                to="/docs/$"
              >
                Get started <ArrowRight />
              </Link>
              <Link
                className={cn(
                  buttonVariants({ size: 'lg', variant: 'outline' }),
                )}
                params={{ _splat: 'migrations/from-v11' }}
                to="/docs/$"
              >
                Migrating from v11
              </Link>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-sm text-muted-foreground">
              <span>
                <span className="select-none">$ </span>pnpm add @trpc12/trpc
                effect
              </span>
              <span
                className="code-unpublished static! font-sans"
                title="The @trpc12 packages aren’t published until tRPC v12 is released"
              >
                Not on npm yet
              </span>
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3">
            <DocBody
              className="min-w-0 [&_.code-block]:my-0! [&_.code-block]:shadow-[0_-24px_300px_0_rgb(57_140_203/0.15)]"
              html={hero.html}
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
          Three files&apos; worth of code, compiled when this site builds: the
          types you hover are the ones your editor shows.
        </p>
        <ol className="grid gap-16">
          {steps.map((step, index) => (
            <li
              className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12"
              id={step.id}
              key={step.id}
            >
              <div className="grid content-start gap-4 lg:sticky lg:top-24">
                <h3 className="flex items-center gap-3 text-xl font-bold tracking-tight">
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm text-primary-foreground"
                  >
                    {index + 1}
                  </span>
                  <HashLink id={step.id}>{step.title}</HashLink>
                </h3>
                <div className="grid gap-3 text-muted-foreground [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground">
                  {step.body}
                </div>
                <Link
                  className={`${docLink} w-fit text-sm`}
                  params={{ _splat: step.slug }}
                  to="/docs/$"
                >
                  {step.guide} <ArrowRight className="inline size-4" />
                </Link>
              </div>
              <DocBody
                className="min-w-0 [&_.code-block]:my-0!"
                html={step.code}
              />
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="features"
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6"
      >
        <h2
          className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
          id="features"
        >
          <HashLink id="features">What&apos;s in v12</HashLink>
        </h2>
        <p className="mb-8 max-w-2xl text-muted-foreground">
          One package,{' '}
          <code className="font-mono text-[0.9em]">@trpc12/trpc</code>, with an
          entry point per job and nothing to install twice.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <li key={feature.slug}>
              <Link
                className="grid h-full content-start gap-2 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/50 [&_svg]:size-5"
                params={{ _splat: feature.slug }}
                to="/docs/$"
              >
                <span className="text-primary">{feature.icon}</span>
                <span className="font-semibold">{feature.title}</span>
                <span className="text-sm text-muted-foreground [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground">
                  {feature.body}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="credits"
        className="mx-auto max-w-7xl border-t px-4 py-16 sm:px-6"
      >
        <h2
          className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
          id="credits"
        >
          <HashLink id="credits">Credits</HashLink>
        </h2>
        <p className="mb-8 max-w-2xl text-muted-foreground">
          v12 builds on projects that got there first, listed in the order they
          came.
        </p>
        <ul className="grid gap-4 md:grid-cols-2">
          {credits.map((credit) => (
            <li
              className="grid content-start gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground [&_a]:font-medium [&_a]:text-link [&_a]:underline-offset-4 [&_a:hover]:underline [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground"
              key={credit.name}
            >
              <p className="flex flex-wrap items-baseline gap-x-2">
                <a
                  className="text-base font-semibold text-foreground!"
                  href={credit.url}
                >
                  {credit.name}
                </a>
                <span>{credit.by}</span>
              </p>
              <p>{credit.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

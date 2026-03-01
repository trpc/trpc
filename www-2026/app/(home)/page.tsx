import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'tRPC - Move Fast and Break Nothing',
  description:
    'End-to-end typesafe APIs made easy. Automatic typesafety & autocompletion inferred from your API-paths, their input data, & outputs.',
};

const features = [
  {
    title: 'Automatic Typesafety',
    description:
      'Made a mistake? Typos become red squiggly lines. Your frontend and backend are always in sync.',
  },
  {
    title: 'Snappy DX',
    description:
      "tRPC has no build or compile steps, meaning no code generation, runtime bloat, or build step. It's just TypeScript.",
  },
  {
    title: 'Framework Agnostic',
    description:
      'Compatible with all JavaScript frameworks and runtimes. Easy to add to your existing projects.',
  },
  {
    title: 'Light & Performant',
    description:
      'tRPC has zero deps and a tiny client-side footprint making it lightweight.',
  },
  {
    title: 'Easy to Adopt',
    description:
      'Add to existing brownfield project or start a new greenfield project. Works with REST and is incrementally adoptable.',
  },
  {
    title: 'Batteries Included',
    description:
      'We provide adapters for React, Next.js, Express, Fastify, AWS Lambda, Fetch, and more.',
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <header className="mx-auto max-w-4xl px-6 pb-16 pt-12 text-center lg:pt-20">
        <div className="mb-8 flex justify-center">
          <svg
            width="96"
            height="96"
            viewBox="0 0 128 128"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M90.5 0H37.5C16.7893 0 0 16.7893 0 37.5V90.5C0 111.211 16.7893 128 37.5 128H90.5C111.211 128 128 111.211 128 90.5V37.5C128 16.7893 111.211 0 90.5 0Z"
              fill="#398CCB"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M63.8615 18.75L81.6307 29.002V34.639L103.138 47.0595V68.306L108.908 71.6365V92.152L91.15 102.404L83.2662 97.8445L64.098 108.912L45.0445 97.9085L37.2713 102.404L19.5135 92.1345V71.6365L25.0578 68.4358V47.0595L46.1038 34.9095L46.1155 34.909V29.002L63.8615 18.75ZM81.6307 39.9698V49.5058L63.873 59.7578L46.1155 49.5058V40.234L46.1038 40.2345L29.673 49.725V65.771L37.2713 61.3845L55.0288 71.6365V92.1345L49.6565 95.2413L64.098 103.581L78.6545 95.178L73.3922 92.1345V71.6365L91.15 61.3845L98.523 65.6413V49.725L81.6307 39.9698ZM78.0077 89.4923V76.9788L88.8422 83.2328V95.7463L78.0077 89.4923ZM104.292 76.9615L93.4577 83.2155V95.7463L104.292 89.475V76.9615ZM24.1289 89.475V76.9615L34.9635 83.2155V95.7288L24.1289 89.475ZM50.4135 76.9615L39.5788 83.2155V95.7288L50.4135 89.475V76.9615ZM80.3155 72.9808L91.15 66.727L101.984 72.9808L91.15 79.2405L80.3155 72.9808ZM37.2713 66.7095L26.4365 72.9808L37.2713 79.223L48.1058 72.9808L37.2713 66.7095ZM50.7308 46.8405V34.327L61.5537 40.5865V53.0943L50.7308 46.8405ZM77.0038 34.327L66.1807 40.5865V53.0885L77.0038 46.8405V34.327ZM53.0385 30.3345L63.8615 24.0808L74.6962 30.3345L63.8615 36.5885L53.0385 30.3345Z"
              fill="white"
            />
          </svg>
        </div>
        <h1 className="whitespace-pre-wrap text-center text-2xl font-extrabold leading-tight tracking-tight md:text-3xl lg:text-4xl xl:text-5xl">
          Move Fast and Break Nothing.{'\n'}End-to-end typesafe APIs made easy.
        </h1>
        <p className="mx-auto max-w-[60ch] pt-4 text-center text-sm font-medium text-fd-muted-foreground md:text-lg">
          Experience the full power of{' '}
          <span className="text-fd-foreground underline decoration-rose-500 decoration-wavy decoration-from-font underline-offset-2">
            TypeScript
          </span>{' '}
          inference to boost productivity for your full-stack application.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs/quickstart"
            className="rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
          >
            Quickstart
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-fd-border px-6 py-3 font-medium hover:bg-fd-accent"
          >
            Documentation
          </Link>
          <a
            href="https://github.com/trpc/trpc"
            className="rounded-lg border border-fd-border px-6 py-3 font-medium hover:bg-fd-accent"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Why tRPC?
        </h2>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-fd-border p-6"
            >
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm text-fd-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quote */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-8 text-center text-3xl font-bold">
          You may not need a traditional API
        </h2>
        <blockquote className="space-y-3 border-l-4 border-fd-primary py-2 pl-6 italic">
          <p className="text-fd-muted-foreground">
            &quot;I built tRPC to allow people to{' '}
            <strong className="text-fd-foreground">move faster</strong> by
            removing the need of a traditional API-layer, while still having
            confidence that our apps won&apos;t break as we rapidly
            iterate.&quot;
          </p>
          <p className="text-fd-muted-foreground">
            Try it out for yourself and let us know what you think!
          </p>
        </blockquote>
        <a
          className="mt-6 flex items-center gap-3 no-underline"
          href="https://twitter.com/alexdotjs"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="https://avatars.githubusercontent.com/u/459267?v=4"
            alt="Alex/KATT"
            loading="lazy"
            className="h-12 w-12 rounded-full"
          />
          <div>
            <p className="text-base font-bold">Alex/KATT</p>
            <p className="text-sm text-fd-muted-foreground">
              Creator of tRPC
            </p>
          </div>
        </a>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="mb-4 text-3xl font-bold">Ready to get started?</h2>
        <p className="mb-8 text-fd-muted-foreground">
          Check out the quickstart guide to build your first tRPC app in
          minutes.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/docs/quickstart"
            className="rounded-lg bg-fd-primary px-8 py-3 font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/trpc/trpc"
            className="rounded-lg border border-fd-border px-8 py-3 font-medium hover:bg-fd-accent"
            target="_blank"
            rel="noreferrer"
          >
            Star on GitHub
          </a>
        </div>
      </section>
    </main>
  );
}

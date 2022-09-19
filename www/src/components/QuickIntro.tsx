import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React, { FC, ReactNode } from 'react';
import Step1 from '../../docs/landing-intro/Step1.md';
import Step2 from '../../docs/landing-intro/Step2.md';
import Step3 from '../../docs/landing-intro/Step3.md';
import { SectionTitle } from './SectionTitle';

type StepProps = {
  num: number;
  title: ReactNode;
  description: ReactNode;
  code: ReactNode;
  rightSide?: boolean;
};

const Step: FC<StepProps> = ({ num, title, description, code, rightSide }) => {
  return (
    <div className="flex flex-col justify-between gap-12 lg:flex-row">
      <div
        className={clsx('flex-1 order-1 lg:order-[0]', {
          'lg:order-1': rightSide,
        })}
      >
        {code}
      </div>
      <div className="flex-1">
        <div className="flex flex-col justify-center gap-3 lg:flex-row lg:items-center lg:justify-start">
          <div className="grid w-6 h-6 rounded-full dark:bg-primary-200 bg-primary place-items-center shrink-0">
            <p className="font-bold dark:text-[#313131] text-white">{num}</p>
          </div>
          <h2 className="text-xl font-bold lg:text-2xl">{title}</h2>
        </div>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 md:text-base">
          {description}
        </p>
      </div>
    </div>
  );
};

const steps: Omit<StepProps, 'num'>[] = [
  {
    title: 'Define your procedures',
    description: (
      <>
        The first step to creating a tRPC API is to define your procedures.
        Procedures <i>composable</i> and can be queries, mutations, or
        subscriptions. Routers contain multiple procedures.
        <br /> <br />
        Here, we add a <Link href="https://github.com/colinhacks/zod">
          Zod
        </Link>{' '}
        validator to ensure the input from the client is exactly what we expect
        it to be.
        <br /> <br />
        At the end, we export the type of our router so that we can use it to
        provide a fully-typed experience on the client without importing any
        server code.
      </>
    ),
    code: <Step1 />,
  },
  {
    title: 'Create your HTTP server',
    description: (
      <>
        Next, we create our HTTP server using our <code>appRouter</code> . We
        now have a tRPC server running!
        <br /> <br />
        tRPC comes with many adapters, allowing you to create a server using
        your favorite framework like Next.js, the Fetch API (Astro, Remix,
        SvelteKit, Cloudflare Workers, etc.), Express, Fastify, AWS Lambda, or a
        vanilla Node HTTP server.
      </>
    ),
    code: <Step2 />,
    rightSide: true,
  },
  {
    title: 'Connect your client and start querying!',
    description: (
      <>
        Now that we have the server running, we can create a client and start
        querying data.
        <br /> <br />
        We pass the <code>AppRouter</code> type when creating the client to give
        us TypeScript autocompletion and intellisense that matches the backend
        API without requiring any code generation!
      </>
    ),
    code: <Step3 />,
  },
];

export const QuickIntro: FC = () => {
  return (
    <>
      <SectionTitle
        id="quick-intro"
        title={
          <>
            Simple to use with <br /> unmatched developer experience
          </>
        }
        description="It's quick and easy to get started using tRPC and build a type safe API."
      />
      <div className="flex flex-col gap-12 mt-6">
        {steps.map((step, index) => (
          <Step key={index} num={index + 1} {...step} />
        ))}
      </div>
    </>
  );
};

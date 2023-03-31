import Link from '@docusaurus/Link';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import React, { FC, ReactNode } from 'react';
import Step1 from '../../docs/landing-intro/Step1.md';
import Step2 from '../../docs/landing-intro/Step2.md';
import Step3 from '../../docs/landing-intro/Step3.md';
import { popIn } from '../animations/popIn';
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
    <motion.div
      variants={popIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="flex flex-col justify-between gap-12 lg:flex-row"
    >
      <div
        className={clsx('order-1 flex-1 lg:order-none', {
          'lg:order-1': rightSide,
        })}
      >
        {code}
      </div>
      <div className="flex-1">
        <div className="flex flex-col justify-center gap-3 lg:flex-row lg:items-center lg:justify-start">
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary dark:bg-primary-dark">
            <p className="font-bold text-white dark:text-zinc-800">{num}</p>
          </div>
          <h2 className="text-xl font-bold lg:text-2xl">{title}</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 md:text-base">
          {description}
        </p>
      </div>
    </motion.div>
  );
};

const steps: Omit<StepProps, 'num'>[] = [
  {
    title: 'Define your procedures',
    description: (
      <>
        The first step to creating a tRPC API is to define your procedures.
        <br /> <br />
        Procedures are the functions we will use to build your backend.
        They&apos;re <i>composable</i> and can be queries, mutations, or
        subscriptions. Routers contain multiple procedures.
        <br /> <br />
        In this procedure, we use a{' '}
        <Link href="https://github.com/colinhacks/zod">Zod</Link> validator to
        ensure the input from the client has exactly the shape that our
        procedure expects. We will also return a simple text string from the
        query.
        <br /> <br />
        At the end of the file, we export the type of the router so we can use
        it in our frontend code in just a few moments.
      </>
    ),
    code: <Step1 />,
  },
  {
    title: 'Create your HTTP server',
    description: (
      <>
        Next, we create our HTTP server using our <code>appRouter</code>. We now
        have a tRPC server running!
        <br /> <br />
        tRPC has many adapters so it can meet you where you are. Next.js,
        Express, the Fetch API (Astro, Remix, SvelteKit, Cloudflare Workers,
        etc.), Fastify, AWS Lambda, or a vanilla Node HTTP server.
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
        us TypeScript autocompletion and Intellisense that matches the backend
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
        description="It's quick and easy to get started with tRPC to build a typesafe API."
      />
      <div className="mt-8 flex flex-col gap-12 lg:mt-12 lg:gap-16">
        {steps.map((step, index) => (
          <Step key={index} num={index + 1} {...step} />
        ))}
      </div>
    </>
  );
};

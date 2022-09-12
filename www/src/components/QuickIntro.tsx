import Highlight, { defaultProps } from 'prism-react-renderer';
import theme from 'prism-react-renderer/themes/vsDark';
import React, { ComponentProps, FC, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { SectionTitle } from './SectionTitle';

const exampleCode = `const t = initTRPC.create();

const appRouter = t.router({
  greeting: t.procedure
    .input(
      z.object({
        name: z.string().nullish(),
      })
      .nullish(),
    )
    .query(({ input }) => {
      return {
        text: "Hello " + input?.name ?? "World",
      };
    }),
});

export type AppRouter = typeof appRouter;`;

const httpSeverCodeExample = `const { listen } = createHTTPServer({
  router: appRouter,
});

// The API will now be listening on port 3000!
listen(3000);
`;

const clientCodeExample = `async function main() {
  const client = createTRPCProxyClient<AppRouter>({
    url: "http://localhost:3000"
  });

  const res = await client.greeting.query({ name: "John" });

  console.log(res.text);
}`;

type StepProps = {
  readonly num: number;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly code: string;
  readonly rightSide?: boolean;
};

const Step: FC<StepProps> = ({ num, title, description, code, rightSide }) => {
  return (
    <div className="flex flex-col justify-between gap-12 lg:flex-row">
      <div
        className={twMerge(
          'flex-1 order-1 lg:order-[0]',
          rightSide && 'lg:order-1',
        )}
      >
        <Highlight
          {...defaultProps}
          code={code}
          language="typescript"
          theme={theme}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={className} style={style}>
              {tokens.map((line, i) => (
                <div key={`line-${i}`} {...getLineProps({ line, key: i })}>
                  {line.map((token, key) => (
                    <span
                      key={`token-${key}`}
                      {...getTokenProps({ token, key })}
                    />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
      <div className="flex-1">
        <h2 className="flex items-center gap-6 text-xl font-bold lg:text-2xl">
          <span className="flex items-center justify-center w-6 h-6 text-base text-black rounded-full bg-zinc-400">
            {num}
          </span>{' '}
          {title}
        </h2>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 md:text-base">
          {description}
        </p>
      </div>
    </div>
  );
};

const steps: ComponentProps<typeof Step>[] = [
  {
    num: 1,
    title: 'Define your routers and procedures.',
    description: (
      <>
        The first step into creating a tRPC API is to define your routers and
        procedures. Routers can have multiple procedures of type query, mutation
        or subscription and they can have an input typed with zod.
        <br /> <br />
        Routers can also merge together into one appRouter so you can separate
        your routers easily.
        <br /> <br />
        Your appRouter is exported with it&apos;s type and that is what is used
        to create your API endpoint and connect to the client!
      </>
    ),
    code: exampleCode,
  },
  {
    num: 2,
    title: 'Create your HTTP server.',
    description: (
      <>
        Next up, we plug in the appRouter into our HTTPServer method to create a
        server and we listen on port 3000, that&apos;s it! You now have a tRPC
        server running! <br /> <br />
        tRPC comes with many adapters to let you create an API server using your
        favorite framework like Express, Fastify, Next.js, AWS Lambda or you can
        create one using the standalone adapter!.
      </>
    ),
    code: httpSeverCodeExample,
    rightSide: true,
  },
  {
    num: 3,
    title: 'Connect your client and start querying!',
    description: (
      <>
        Now that we have the server running and exported the AppRouter type, we
        can use those to connect our client to the server and start querying
        data! <br /> <br /> We pass the AppRouter when creating the client to
        give us typescript autocompletion and intellisense that matches the
        backend API without needing any code generation!
      </>
    ),
    code: clientCodeExample,
  },
];

export const QuickIntro: FC = () => {
  return (
    <section id="#quick-intro">
      <SectionTitle
        id="quick-intro"
        title={
          <>
            Simple to use with <br /> unmatched DX experience.
          </>
        }
      />
      <div className="flex flex-col gap-12 mt-6">
        {steps.map((step) => (
          <Step key={step.num} {...step} />
        ))}
      </div>
    </section>
  );
};

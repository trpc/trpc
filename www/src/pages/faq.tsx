import Head from '@docusaurus/Head';
import { Disclosure, Transition } from '@headlessui/react';
import Layout from '@theme/Layout';
import React from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';

const data = [
  {
    '@content': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: {
      '@type': 'Question',
      name: 'Is V10 stable for production?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, V10 is stable enough for production usage but there is the possibility that some API might change until the stable release comes out.',
      },
    },
  },
  {
    '@content': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: {
      '@type': 'Question',
      name: "Input parsers doesn't give me the correct types",
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A possible solution for this is to make sure that strict mode is enabled in your tsconfig file.',
      },
    },
  },
  {
    '@content': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: {
      '@type': 'Question',
      name: 'getServerSideProps is not working for me.',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Due to the nature of how SSR in tRPC works and how it utilizes getInitialProps, any getServerSideProps call won't be picked up. If you would like to use getServerSideProps, we would recommend disabling ssr for tRPC and using the ssg helper function to prefetch data inside your getServerSideProps function.",
      },
    },
  },
  {
    '@content': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: {
      '@type': 'Question',
      name: "Superjson transformer isn't working.",
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Make sure to setup superjson as your transformer on both the server and the client side.',
      },
    },
  },
];

const Faq = () => {
  return (
    <Layout>
      <Head>
        <script type="application/ld+json">{JSON.stringify(data)}</script>
      </Head>
      <main className="container py-12 mx-auto lg:py-28">
        <h1 className="text-2xl font-bold text-center lg:text-3xl">
          Most frequently asked questions
        </h1>
        <p className="pt-2 text-center text-zinc-700 dark:text-zinc-300">
          A collection of the most commonly asked questions in regard to
          everything tRPC.
        </p>
        <div className="mt-6">
          {data.map((item, index) => (
            <Disclosure
              as="div"
              key={`item-${index}`}
              className="max-w-3xl mx-auto mt-3"
            >
              {({ open }) => (
                <>
                  <Disclosure.Button
                    as="button"
                    className="flex items-center justify-between w-full px-6 py-3 text-base text-left transition-colors lg:text-lg bg-zinc-100 dark:bg-zinc-800/50 ring-1 ring-zinc-200 dark:ring-zinc-800 rounded-xl"
                  >
                    {item.mainEntity.name}
                    {open ? <FiMinus /> : <FiPlus />}
                  </Disclosure.Button>
                  <Transition
                    enter="transition duration-100 ease-out"
                    enterFrom="transform scale-95 opacity-0"
                    enterTo="transform scale-100 opacity-100"
                    leave="transition duration-75 ease-out"
                    leaveFrom="transform scale-100 opacity-100"
                    leaveTo="transform scale-95 opacity-0"
                  >
                    <Disclosure.Panel className="px-6 py-3">
                      {item.mainEntity.acceptedAnswer.text}
                    </Disclosure.Panel>
                  </Transition>
                </>
              )}
            </Disclosure>
          ))}
        </div>
      </main>
    </Layout>
  );
};

export default Faq;

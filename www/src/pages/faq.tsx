import { Disclosure, Transition } from '@headlessui/react';
import Layout from '@theme/Layout';
import React from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';

const list = [
  {
    question: <>Is V10 stable for production?</>,
    answer: (
      <>
        Yes, V10 is stable enough for production usage but there is the
        possibility that some API might change until the stable release comes
        out.
      </>
    ),
  },
  {
    question: <>Input parsers doesn&apos;t give me the correct types</>,
    answer: (
      <>
        A possible solution for this is to make sure that strict mode is enabled
        in your tsconfig file.
      </>
    ),
  },
  {
    question: <>getServerSideProps is not working for me.</>,
    answer: (
      <>
        Due to the nature of how SSR in tRPC works and how it utilizes
        getInitialProps, any getServerSideProps call won&apos;t be picked up. If
        you would like to use getServerSideProps, we would recommend disabling
        ssr for tRPC and using the ssg helper function to prefetch data inside
        your getServerSideProps function.
      </>
    ),
  },
  {
    question: <>Superjson transformer isn&apos;t working.</>,
    answer: (
      <>
        Make sure to setup superjson as your transformer on both the server and
        the client side.
      </>
    ),
  },
];

const Faq = () => {
  return (
    <Layout>
      <main className="container mx-auto pt-28">
        <h1 className="text-center text-3xl font-bold">
          Most frequently asked questions
        </h1>
        <p className="text-center text-zinc-700 pt-2 dark:text-zinc-300">
          A collection of the most commonly asked questions in regard to
          everything tRPC.
        </p>
        <div className="mt-6">
          {list.map((item, index) => (
            <Disclosure
              as="div"
              key={`item-${index}`}
              className="mt-3 max-w-3xl mx-auto"
            >
              {({ open }) => (
                <>
                  <Disclosure.Button
                    as="button"
                    className="flex justify-between items-center w-full text-lg bg-zinc-100 dark:bg-zinc-800/50 transition-colors ring-1 ring-zinc-200 dark:ring-zinc-800 py-3 px-6 rounded-xl"
                  >
                    {item.question}
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
                    <Disclosure.Panel className="py-3 px-6">
                      {item.answer}
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

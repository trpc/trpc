import { Disclosure, Transition } from '@headlessui/react';
import React from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';

export const data = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is V10 stable for production?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, V10 is stable enough for production usage but there is the possibility that some API might change until the stable release comes out.',
      },
    },
    {
      '@type': 'Question',
      name: "Input parsers doesn't give me the correct types",
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A possible solution for this is to make sure that strict mode is enabled in your tsconfig file.',
      },
    },
    {
      '@type': 'Question',
      name: "Superjson transformer isn't working.",
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Make sure to setup superjson as your transformer on both the server and the client side.',
      },
    },
  ],
};

export const Faq = () => {
  return (
    <div className="mt-6">
      {data.mainEntity &&
        data.mainEntity.map((item, index) => (
          <Disclosure as="div" key={`item-${index}`} className="mt-3">
            {({ open }) => (
              <>
                <Disclosure.Button
                  as="button"
                  className="flex items-center justify-between w-full px-6 py-3 text-base text-left transition-colors lg:text-lg bg-zinc-100 dark:bg-zinc-800/50 ring-1 ring-zinc-200 dark:ring-zinc-800 rounded-xl"
                >
                  {item.name}
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
                    {item.acceptedAnswer.text}
                  </Disclosure.Panel>
                </Transition>
              </>
            )}
          </Disclosure>
        ))}
    </div>
  );
};

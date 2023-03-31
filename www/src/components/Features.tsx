import React, { FC } from 'react';
import { FaBatteryFull, FaSeedling } from 'react-icons/fa';
import { FiBriefcase, FiLock, FiTerminal, FiZap } from 'react-icons/fi';

const features = [
  {
    title: 'Automatic typesafety',
    description:
      'Made a server side change? TypeScript will warn you of errors on your client before you even save the file!',
    icon: <FiLock size={20} />,
    color:
      'dark:bg-indigo-900/50 bg-indigo-200 dark:text-indigo-300 text-indigo-600',
  },
  {
    title: 'Snappy DX',
    description:
      'tRPC has no build or compile steps, meaning no code generation, runtime bloat or build step.',
    icon: <FiZap size={20} />,
    color:
      'dark:bg-amber-900/50 bg-amber-200 dark:text-amber-300 text-amber-600',
  },
  {
    title: 'Framework agnostic',
    description:
      "Compatible with all JavaScript frameworks and runtimes. It's easy to add to your existing projects.",
    icon: <FiBriefcase size={20} />,
    color: 'dark:bg-pink-900/50 bg-pink-200 dark:text-pink-300 text-pink-600',
  },
  {
    title: 'Autocompletion',
    description:
      "Using tRPC is like using an SDK for your API's server code, giving you confidence in your endpoints.",
    icon: <FiTerminal size={20} />,
    color:
      'dark:bg-orange-900/50 bg-orange-200 dark:text-orange-300 text-orange-600',
  },
  {
    title: 'Light bundle size',
    description:
      'tRPC has zero dependencies and a tiny client-side footprint making it lightweight.',
    icon: <FaSeedling size={20} />,
    color: 'dark:bg-lime-900/50 bg-lime-200 dark:lime-orange-300 text-lime-600',
  },
  {
    title: 'Batteries included',
    description:
      'We provide adapters for React, Next.js, Express, Fastify, AWS Lambda, Solid, Svelte, and more.',
    icon: <FaBatteryFull size={20} />,
    color: 'dark:bg-sky-900/50 bg-sky-200 dark:lime-sky-300 text-sky-600',
  },
];

export const Features: FC = () => {
  return (
    <div className="mx-auto grid grid-cols-1 gap-6 lg:grid-cols-3">
      {features.map((feature) => {
        return (
          <div key={feature.title}>
            <h2
              className={`${feature.color} mb-3 grid h-12 w-12 place-items-center rounded-xl`}
            >
              {feature.icon}
            </h2>
            <h3 className="text-lg font-bold md:text-xl">{feature.title}</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 md:text-base">
              {feature.description}
            </p>
          </div>
        );
      })}
    </div>
  );
};

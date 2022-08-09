import React, { FC } from 'react';
import { FiBriefcase, FiLock, FiZap } from 'react-icons/fi';

const features = [
  {
    title: 'Automatic typesafety',
    description:
      'Automatic typesafety & autocompletion inferred from your API-paths, their input data, & outputs.',
    icon: <FiLock size={20} />,
    color:
      'dark:bg-indigo-900/50 bg-indigo-200 dark:text-indigo-300 text-indigo-600',
  },
  {
    title: 'Light & Snappy DX',
    description:
      'No code generation, run-time bloat, or build pipeline. Zero dependencies & a tiny client-side footprint.',
    icon: <FiZap size={20} />,
    color:
      'dark:bg-amber-900/50 bg-amber-200 dark:text-amber-300 text-amber-600',
  },
  {
    title: 'Add to existing brownfield project',
    description:
      'Easy to add to your existing brownfield project with adapters for Connect/Express/Next.js.',
    icon: <FiBriefcase size={20} />,
    color: 'dark:bg-pink-900/50 bg-pink-200 dark:text-pink-300 text-pink-600',
  },
];

export const Features: FC = () => {
  return (
    <div className="container grid grid-cols-1 gap-6 pt-36 mx-auto lg:grid-cols-3">
      {features.map((feature) => {
        return (
          <div key={feature.title}>
            <h2
              className={`${feature.color} mb-3 rounded-xl w-12 h-12 grid place-items-center`}
            >
              {feature.icon}
            </h2>
            <h3 className="text-lg font-bold md:text-xl">{feature.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 md:text-base">
              {feature.description}
            </p>
          </div>
        );
      })}
    </div>
  );
};

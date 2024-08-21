import React from 'react';
import { companies } from './CompaniesUsing.script.output';
import { SectionTitle } from './SectionTitle';

const animationRow = Array(2).fill(0) as [number, number];

/**
 * An animated logo carousel to show companies using tRPC. Tailwind code taken from Cruip
 * @link https://cruip.com/create-an-infinite-horizontal-scroll-animation-with-tailwind-css/
 */
export const CompaniesUsing = () => {
  return (
    <>
      <SectionTitle
        id="companies-using"
        title="As used by"
        description="tRPC is tried and trusted by leading tech teams."
      />
      <div className="my-6 inline-flex w-full flex-nowrap overflow-hidden [mask-image:_linear-gradient(to_right,transparent_0,_black_128px,_black_calc(100%-200px),transparent_100%)]">
        {animationRow.map((_, index) => (
          <ul
            key={`animationRow${index}`}
            className="flex animate-infinite-scroll items-center justify-center md:justify-start [&_img]:max-w-none [&_li]:mx-8"
            aria-hidden={index > 0}
          >
            {companies.map((it) => (
              <li key={it.src}>
                <img
                  src={it.src}
                  alt={it.name}
                  className="max-h-9 dark:invert"
                />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </>
  );
};

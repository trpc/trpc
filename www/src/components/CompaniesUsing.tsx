import React from 'react';
import { companyLogos } from './companies';
import { SectionTitle } from './SectionTitle';

const animationRow = Array(2).fill(0) as [number, number];

/**
 * A logo carousel to show companies using tRPC
 * @see https://cruip.com/create-an-infinite-horizontal-scroll-animation-with-tailwind-css/
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
            {Object.entries(companyLogos).map(([key, value]) => (
              <li key={key}>
                <img src={value} alt={key} className="max-h-9" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </>
  );
};

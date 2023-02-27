import Link from '@docusaurus/Link';
import React from 'react';
import { FiArrowRightCircle } from 'react-icons/fi';
import { allSponsors, topSponsors } from './script.output';

export const TopSponsors = () => {
  return (
    <div className="grid items-center justify-center grid-flow-row gap-4 mt-12 justify-items-center">
      <h2 className="text-lg font-extrabold tracking-wider uppercase opacity-50">
        Supported by
      </h2>
      <div className="grid grid-cols-3 gap-4 sm:grid-flow-col sm:grid-cols-none">
        {topSponsors.map((sponsor) => {
          return (
            <Link
              key={sponsor.name}
              href={sponsor.link}
              target="_blank"
              rel="noopener"
              title={sponsor.name}
            >
              <img
                className="h-20 transition duration-300 shadow-none opacity-50 grayscale hover:grayscale-0 hover:shadow-lg rounded-2xl hover:opacity-100"
                src={sponsor.imgSrc}
                alt={sponsor.name}
              />
            </Link>
          );
        })}
        <Link
          href="https://trpc.io/sponsor"
          target="_blank"
          rel="noopener"
          title="tRPC Sponsors"
        >
          <div className="grid content-center w-20 h-20 grid-flow-row p-2 font-bold tracking-tight text-center transition duration-300 opacity-50 justify-items-center grayscale hover:grayscale-0 hover:opacity-100">
            <FiArrowRightCircle size={20} />
            <span>{allSponsors.length - topSponsors.length} more</span>
          </div>
        </Link>
      </div>
      <p className="mt-2 text-sm opacity-50">
        Many thanks to all of our amazing sponsors!
      </p>
    </div>
  );
};

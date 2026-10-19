import Link from '@docusaurus/Link';
import React from 'react';
import { FiArrowRightCircle } from 'react-icons/fi';
import { allSponsors, topSponsors } from './script.output';

export const TopSponsors = () => {
  return (
    <div className="mt-12 grid grid-flow-row items-center justify-center justify-items-center gap-4">
      <h2 className="text-lg font-extrabold uppercase tracking-wider opacity-50">
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
                className="h-20 rounded-2xl opacity-50 shadow-none grayscale transition duration-300 hover:opacity-100 hover:shadow-lg hover:grayscale-0"
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
          <div className="grid h-20 w-20 grid-flow-row content-center justify-items-center p-2 text-center font-bold tracking-tight opacity-50 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0">
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

import BrowserOnly from '@docusaurus/BrowserOnly';
import React, { Suspense } from 'react';
import { FiStar } from 'react-icons/fi';

const AnimatedNumbers = React.lazy(() => import('react-animated-numbers'));

let starCountStart = 0;

export const GithubStarCountButton = () => {
  const [starCount, setStarCount] = React.useState(starCountStart);

  React.useEffect(() => {
    // setTimeout(() => {
    //   setStarCount(10_000);
    // }, 1000);
    void fetch('https://api.github.com/repos/tRPC/tRPC')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.stargazers_count === 'number') {
          starCountStart = data.stargazers_count;
          setStarCount(data.stargazers_count);
        }
      });
  }, []);

  return (
    <a
      href="https://github.com/trpc/trpc/stargazers"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-4 text-sm font-bold text-black transition-all rounded-lg md:text-base hover:no-underline hover:text-black bg-gradient-to-r from-cyan-100 via-cyan-200 to-cyan-300 hover:bg-slate-100 hover:from-cyan-300 hover:to-cyan-300"
    >
      <div className="flex gap-2 items-center py-2">
        <FiStar strokeWidth={3} /> Star
      </div>

      <div
        className={`transition-all duration-1000 overflow-hidden font-mono ${
          starCount ? 'w-14' : 'w-0'
        }`}
      >
        {/* This little thing is an awful hack and any OSS-contributor is welcome to come up / implement another idea for how we deal with loading state of the stars */}
        <BrowserOnly>
          {() => (
            <Suspense fallback={null}>
              <AnimatedNumbers
                includeComma
                animateToNumber={starCount}
                fontStyle={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
                configs={[{ mass: 1, tension: 220, friction: 100 }]}
              />
            </Suspense>
          )}
        </BrowserOnly>
        <span className="py-2"> </span>
      </div>
    </a>
  );
};

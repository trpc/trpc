import React from 'react';
import AnimatedNumbers from 'react-animated-numbers';
import { FiStar } from 'react-icons/fi';

export const GithubStarCountButton = () => {
  const [starCount, setStarCount] = React.useState(0);

  React.useEffect(() => {
    void fetch('https://api.github.com/repos/tRPC/tRPC')
      .then((res) => res.json())
      .then((data) => setStarCount(data.stargazers_count));
  }, []);

  return (
    <a
      href="https://github.com/trpc/trpc/stargazers"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-4 text-sm font-bold text-black transition-colors rounded-lg md:text-base hover:no-underline hover:text-black bg-gradient-to-r from-cyan-100 via-cyan-200 to-cyan-300"
    >
      <div className="flex gap-2 items-center py-2">
        <FiStar strokeWidth={3} /> Star
      </div>
      <AnimatedNumbers
        includeComma
        animateToNumber={starCount}
        fontStyle={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
        configs={[{ mass: 1, tension: 220, friction: 100 }]}
      ></AnimatedNumbers>
    </a>
  );
};

import React from 'react';
import { FiStar } from 'react-icons/fi';

let starCountStart = 0;

export const GithubStarCountButton = () => {
  const [starCount, setStarCount] = React.useState(starCountStart);

  React.useEffect(() => {
    void fetch('https://api.github.com/repos/tRPC/tRPC')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.stargazers_count === 'number') {
          starCountStart = data.stargazers_count;
          setStarCount(data.stargazers_count);
        }
      });
  }, []);

  const starCountStr = starCount
    ? new Intl.NumberFormat().format(starCount)
    : null;

  return (
    <a
      href="https://github.com/trpc/trpc/stargazers"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-[5px] px-4 text-sm font-bold text-black transition rounded-lg md:text-base hover:no-underline py-2 hover:text-black bg-gradient-to-r from-cyan-100 via-cyan-200 to-cyan-300 hover:from-cyan-300 hover:via-cyan-300 hover:to-cyan-300"
    >
      <div className="flex items-center gap-2">
        <FiStar strokeWidth={3} /> Star
      </div>

      <div
        className={`transition-all duration-1000 inline-block overflow-hidden font-mono whitespace-nowrap ${
          starCount ? 'w-[58px] opacity-100' : 'w-0 opacity-0'
        }`}
      >
        {starCount ? new Intl.NumberFormat().format(starCount) : null}
      </div>
    </a>
  );
};

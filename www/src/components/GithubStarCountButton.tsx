import React from 'react';
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
      className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-black transition-colors rounded-lg md:text-base hover:no-underline hover:text-black bg-gradient-to-r from-cyan-100 via-cyan-200 to-cyan-300"
    >
      <FiStar strokeWidth={3} /> Star {starCount}
    </a>
  );
};

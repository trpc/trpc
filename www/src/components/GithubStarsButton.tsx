import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { FiStar } from 'react-icons/fi';
import { Button } from './Button';

export const GithubStarsButton = () => {
  const [stars, setStars] = useState<string>();

  const fetchStars = async () => {
    const res = await fetch('https://api.github.com/repos/tRPC/tRPC');
    const data = await res.json();
    if (typeof data?.stargazers_count === 'number') {
      setStars(new Intl.NumberFormat().format(data.stargazers_count));
    }
  };

  useEffect(() => {
    fetchStars().catch(console.error);
  }, []);

  return (
    <Button
      secondary
      href="https://github.com/trpc/trpc/stargazers"
      target="_blank"
      className="text-lg"
    >
      <FiStar size={18} strokeWidth={3} />
      <span>Star</span>
      <span
        className={clsx(
          'transition-all duration-1000 whitespace-nowrap overflow-hidden',
          stars ? 'opacity-100 w-[58px]' : 'opacity-0 w-0',
        )}
      >
        {stars}
      </span>
    </Button>
  );
};

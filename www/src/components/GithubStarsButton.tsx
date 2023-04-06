import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { FiStar } from 'react-icons/fi';
import { Button } from './Button';

type Props = {
  className?: string;
};

export const GithubStarsButton = ({ className }: Props) => {
  const [stars, setStars] = useState<string>();

  const fetchStars = async () => {
    const res = await fetch('https://api.github.com/repos/tRPC/tRPC');
    const data = (await res.json()) as { stargazers_count: number };
    if (typeof data?.stargazers_count === 'number') {
      setStars(new Intl.NumberFormat().format(data.stargazers_count));
    }
  };

  useEffect(() => {
    fetchStars().catch(console.error);
  }, []);

  return (
    <Button
      variant="secondary"
      href="https://github.com/trpc/trpc/stargazers"
      target="_blank"
      className={className}
    >
      <FiStar size={18} strokeWidth={3} />
      <span>Star</span>
      <span
        style={{ transition: 'max-width 1s, opacity 1s' }}
        className={clsx(
          'w-full overflow-hidden whitespace-nowrap',
          stars ? 'max-w-[100px] opacity-100' : 'max-w-0 opacity-0',
        )}
      >
        {stars}
      </span>
    </Button>
  );
};

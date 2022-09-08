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
      className={clsx('text-lg', stars ? 'opacity-100' : 'opacity-0')}
    >
      <FiStar size={18} strokeWidth={3} />
      <span>Star</span>
      <span>{stars}</span>
    </Button>
  );
};

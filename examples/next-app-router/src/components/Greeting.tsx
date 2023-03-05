'use client';

import { useEffect, useState } from 'react';
import { api } from 'trpc-api';

export const Greeting = () => {
  const [greeting, setGreeting] = useState('loading...');

  useEffect(() => {
    api().greeting.query({ text: 'from client' }).then(setGreeting);
  }, []);

  return <>{greeting}</>;
};

'use client';

import { cache, use } from 'react';
import { api } from 'trpc-api';

const greetingCache = cache(() => api.greeting.query({ text: 'from client' }));

export const Greeting = () => {
  const greeting = use(greetingCache());

  return <>{greeting}</>;
};

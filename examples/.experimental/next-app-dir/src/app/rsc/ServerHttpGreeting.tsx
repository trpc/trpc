'use server';

import { api } from 'trpc-api';

export const ServerHttpGreeting = async () => {
  const greeting = await api.greeting.query({ text: 'from server' });

  return <>{greeting}</>;
};

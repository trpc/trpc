import { api } from 'trpc-api';

export const ServerGreeting = async () => {
  const greeting = await api.greeting.query({ text: 'from server' });

  return <>{greeting}</>;
};

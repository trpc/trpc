import { api } from 'trpc-api';

export const ServerHttpGreeting = async () => {
  const greeting = await api.greeting.query({ text: 'from server' });

  return (
    <div>
      {greeting}
      <form
        action={async () => {
          'use server';
          api.greeting.revalidate({ text: 'from server' });
        }}
      >
        <button type="submit">Revalidate</button>
      </form>
    </div>
  );
};

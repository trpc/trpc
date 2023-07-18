import { api } from '~/trpc/server-http';

export const ServerHttpGreeting = async () => {
  const greeting = await api.greeting.query({ text: 'from server' });
  const secret = await api.secret.query();

  return (
    <div>
      <p>{greeting}</p>
      <p>{secret}</p>
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate({ text: 'from server' });
        }}
      >
        <button type="submit">Revalidate HTTP</button>
      </form>
    </div>
  );
};

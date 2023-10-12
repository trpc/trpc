import { api } from '~/trpc/server-http';

export const ServerHttpGreeting = async () => {
  const greeting1 = await api.greeting.query({ text: 'from server1' });
  const greeting2 = await api.greeting.query({ text: 'from server2' });
  const secret = await api.secret.query();

  return (
    <div>
      <p>{greeting1}</p>
      <p>{greeting2}</p>
      <p>{secret}</p>
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate({ text: 'from server1' });
        }}
      >
        <button type="submit">Revalidate HTTP 1</button>
      </form>
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate({ text: 'from server2' });
        }}
      >
        <button type="submit">Revalidate HTTP 2</button>
      </form>
    </div>
  );
};

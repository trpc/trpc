import { api } from '~/trpc/server-http';

export const ServerHttpGreeting = async () => {
  const greeting1 = await api.greeting.query({ text: 'from server1' });
  const greeting2 = await api.greeting.query({ text: 'from server2' });
  const privateGreeting1 = await api.privateGreeting.query({
    text: 'from server1 private',
  });
  const privateGreeting2 = await api.privateGreeting.query({
    text: 'from server1 private',
  });
  const secret = await api.secret.query();

  return (
    <div>
      <p>{greeting1}</p>
      <p>{greeting2}</p>
      <p>{privateGreeting1}</p>
      <p>{privateGreeting2}</p>
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
      <form
        action={async () => {
          'use server';
          await api.privateGreeting.revalidate({
            text: 'from server1 private',
          });
        }}
      >
        <button type="submit">Revalidate HTTP 3</button>
      </form>
      <form
        action={async () => {
          'use server';
          await api.privateGreeting.revalidate({
            text: 'from server2 private',
          });
        }}
      >
        <button type="submit">Revalidate HTTP 4</button>
      </form>
    </div>
  );
};

/**
 * This component invokes the procedure directly on the server,
 * without going through the HTTP endpoint.
 */
import { api } from '~/trpc/server-invoker';

export async function ServerInvokedGreeting() {
  const greeting1 = await api.greeting.query({
    text: 'i never hit an api endpoint',
  });
  const greeting2 = await api.greeting.query({
    text: 'i also never hit an endpoint',
  });
  const privateGreeting1 = await api.privateGreeting.query({
    text: 'i never hit a private api endpoint',
  });
  const privateGreeting2 = await api.privateGreeting.query({
    text: 'i also never hit a private endpoint',
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
          await api.greeting.revalidate({
            text: 'i never hit an api endpoint',
          });
        }}
      >
        <button type="submit">Revalidate Cache 1</button>
      </form>
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate({
            text: 'i also never hit an endpoint',
          });
        }}
      >
        <button type="submit">Revalidate Cache 2</button>
      </form>
      <form
        action={async () => {
          'use server';
          await api.privateGreeting.revalidate({
            text: 'i never hit an api endpoint',
          });
        }}
      >
        <button type="submit">Revalidate Cache 3</button>
      </form>
      <form
        action={async () => {
          'use server';
          await api.privateGreeting.revalidate({
            text: 'i also never hit an endpoint',
          });
        }}
      >
        <button type="submit">Revalidate Cache 4</button>
      </form>
    </div>
  );
}

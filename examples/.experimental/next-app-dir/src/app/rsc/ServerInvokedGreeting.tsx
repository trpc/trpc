/**
 * This component invokes the procedure directly on the server,
 * without going through the HTTP endpoint.
 */
import { Button } from '~/components/button';
import { JsonPreTag } from '~/components/json-pretag';
import { api } from '~/trpc/server-invoker';

export async function ServerInvokedGreeting() {
  const greeting1 = await api.greeting.query({
    text: 'i never hit an api endpoint',
  });
  const greeting2 = await api.greeting.query({
    text: 'i also never hit an endpoint',
  });

  const secret = await api.secret.query();

  return (
    <div className="space-y-2">
      <JsonPreTag object={{ greeting1, greeting2, secret }} />
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate();
        }}
      >
        <Button type="submit">Revalidate Cache</Button>
      </form>
    </div>
  );
}

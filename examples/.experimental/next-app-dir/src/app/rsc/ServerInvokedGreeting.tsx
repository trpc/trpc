/**
 * This component invokes the procedure directly on the server,
 * without going through the HTTP endpoint.
 */
import { Button } from '~/components/button';
import { JsonPreTag } from '~/components/json-pretag';
import { api } from '~/trpc/server-invoker';

export async function ServerInvokedGreeting() {
  const greeting = await api.greeting.query({
    text: 'i never hit an api endpoint',
  });
  const secret = await api.secret.query();

  return (
    <div className="space-y-2">
      <JsonPreTag object={{ greeting, secret }} />
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate({
            text: 'i never hit an api endpoint',
          });
        }}
      >
        <Button type="submit">Revalidate Cache</Button>
      </form>
    </div>
  );
}

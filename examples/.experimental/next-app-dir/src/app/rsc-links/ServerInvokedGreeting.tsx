/**
 * This component invokes the procedure directly on the server,
 * without going through the HTTP endpoint.
 */
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { LockIcon, RefreshCwIcon } from 'lucide-react';
import { api } from '~/trpc/server-invoker';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '../_components/client-ui';

export async function ServerInvokedGreeting() {
  const greeting1 = await api.greeting.query({
    text: 'i never hit an api endpoint',
  });
  const greeting2 = await api.greeting.query({
    text: 'i also never hit an endpoint',
  });

  const secret = await api.secret.query();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cached greetings</CardTitle>
        <CardDescription>
          Each <code>greeting</code> ends in a random number. Its cache keeps
          the number for five seconds, or until you revalidate it; after that, a
          reload gets a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Item variant="outline">
          <ItemContent>
            <ItemDescription>
              <code>
                greeting(&#123; text: &apos;i never hit an api endpoint&apos;
                &#125;)
              </code>
            </ItemDescription>
            <ItemTitle className="font-mono">{greeting1}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <form
              action={async () => {
                'use server';
                await api.greeting.revalidate({
                  text: 'i never hit an api endpoint',
                });
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                <RefreshCwIcon />
                Revalidate Cache 1
              </Button>
            </form>
          </ItemActions>
        </Item>
        <Item variant="outline">
          <ItemContent>
            <ItemDescription>
              <code>
                greeting(&#123; text: &apos;i also never hit an endpoint&apos;
                &#125;)
              </code>
            </ItemDescription>
            <ItemTitle className="font-mono">{greeting2}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <form
              action={async () => {
                'use server';
                await api.greeting.revalidate({
                  text: 'i also never hit an endpoint',
                });
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                <RefreshCwIcon />
                Revalidate Cache 2
              </Button>
            </form>
          </ItemActions>
        </Item>
        <Item variant="muted">
          <ItemMedia variant="icon">
            <LockIcon />
          </ItemMedia>
          <ItemContent>
            <ItemDescription>
              <code>secret()</code>
            </ItemDescription>
            <ItemTitle>{secret}</ItemTitle>
          </ItemContent>
        </Item>
      </CardContent>
    </Card>
  );
}

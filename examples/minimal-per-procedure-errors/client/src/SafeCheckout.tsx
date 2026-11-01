import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { safe } from '@trpc/client';
import { useState } from 'react';
import { Result } from './Result';
import { trpcClient } from './utils/trpc';

/**
 * The same typed error shapes, but as values instead of throws. `safe()` wraps a
 * vanilla client call and hands back a `[data, error]` pair - exactly one side is
 * ever set, so checking either one narrows the other.
 */
export function SafeCheckout() {
  const [result, setResult] = useState('Press the button');

  async function run() {
    setResult('loading...');

    const [order, error] = await safe(
      trpcClient.checkout.mutate({ outcome: 'payment-required' }),
    );

    if (error) {
      const data = error.data;

      // 💡 `order` is `undefined` in here, and TS knows it
      if (data && 'kind' in data && data.kind === 'PAYMENT_REQUIRED') {
        setResult(`Still owing $${(data.amountDue / 100).toFixed(2)}`);
        return;
      }

      setResult(`Some other failure: ${error.message}`);
      return;
    }

    // ...and `error` is `undefined` here, so `order` is safe to read
    setResult(`Order ${order.orderId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <code>safe()</code>
        </CardTitle>
        <CardDescription>
          The same error shapes as values rather than throws.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button className="self-start" size="sm" onClick={run}>
          run checkout
        </Button>
        <Result testId="safe-result">{result}</Result>
      </CardContent>
    </Card>
  );
}

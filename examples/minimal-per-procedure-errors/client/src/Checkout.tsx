import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { useMutation } from '@tanstack/react-query';
import { Result } from './Result';
import { trpc } from './utils/trpc';

const outcomes = [
  'ok',
  'rate-limit',
  'payment-required',
  'unrelated-failure',
] as const;

export function Checkout() {
  const checkout = useMutation(trpc.checkout.mutationOptions());

  function result() {
    switch (checkout.status) {
      case 'idle':
        return 'Pick an outcome above';
      case 'pending':
        return 'loading...';
      case 'success':
        return `Order ${checkout.data.orderId}`;
      case 'error': {
        const data = checkout.error.data;
        if (!data) {
          return checkout.error.message;
        }

        /**
         * `.errors()` on the server turns `data` into a union, so `kind` has to be
         * checked for before it can be read. A procedure with no `.errors()` of its
         * own - `greeting`, say - has no `kind` in its type at all.
         */
        if (!('kind' in data)) {
          // neither handler claimed it, so the router-wide `errorFormatter` shaped it
          return `Unhandled by the procedure (${data.handledBy}): ${data.code}`;
        }

        switch (data.kind) {
          case 'RATE_LIMIT':
            // 💡 `retryAfterMs` is only reachable inside this branch
            return `Rate limited — retry in ${data.retryAfterMs}ms`;
          case 'PAYMENT_REQUIRED':
            return `Payment required — $${(data.amountDue / 100).toFixed(2)} due`;
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <code>checkout</code>
        </CardTitle>
        <CardDescription>
          One procedure, three failure shapes. Pick an outcome and watch the
          client narrow it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {outcomes.map((outcome) => (
            <Button
              key={outcome}
              variant="outline"
              size="sm"
              onClick={() => checkout.mutate({ outcome })}
              disabled={checkout.status === 'pending'}
            >
              {outcome}
            </Button>
          ))}
        </div>
        <Result
          testId="checkout-result"
          tone={checkout.status === 'error' ? 'error' : 'default'}
        >
          {result()}
        </Result>
      </CardContent>
    </Card>
  );
}

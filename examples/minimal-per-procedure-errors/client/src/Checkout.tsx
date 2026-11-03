import { useMutation } from '@tanstack/react-query';
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
    if (checkout.isPending) {
      return 'loading...';
    }

    if (checkout.data) {
      return `Order ${checkout.data.orderId}`;
    }

    const data = checkout.error?.data;
    if (!data) {
      return 'Pick an outcome above';
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

  return (
    <section>
      <h2>
        <code>checkout</code>
      </h2>
      <p>
        One procedure, three failure shapes. Pick an outcome and watch the
        client narrow it.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {outcomes.map((outcome) => (
          <button
            key={outcome}
            onClick={() => checkout.mutate({ outcome })}
            disabled={checkout.isPending}
          >
            {outcome}
          </button>
        ))}
      </div>

      <pre data-testid="checkout-result">{result()}</pre>
    </section>
  );
}

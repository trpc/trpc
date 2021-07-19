import Link from 'next/link';
import { useState } from 'react';
import { trpc } from 'utils/trpc';

export default function AboutPage() {
  const [num, setNumber] = useState<number>();
  const [enabled, setEnabled] = useState<boolean>(true);
  trpc.useSubscription(['randomNumber', undefined], {
    onNext(n) {
      setNumber(n);
    },
    enabled,
  });
  return (
    <div>
      <label>
        Enabled:
        <input
          type="checkbox"
          onChange={(e) => setEnabled(e.target.checked)}
          checked={enabled}
        />
      </label>
      Here&apos;s a random number from a sub: {num} <br />
      <Link href="/">
        <a>Index</a>
      </Link>
    </div>
  );
}

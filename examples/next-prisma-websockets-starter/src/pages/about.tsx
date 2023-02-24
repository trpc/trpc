import Link from 'next/link';
import { useState } from 'react';
import { trpc } from 'utils/trpc';

export default function AboutPage() {
  const [num, setNumber] = useState<number>();
  trpc.randomNumber.useSubscription(undefined, {
    onData(n) {
      setNumber(n);
    },
  });

  return (
    <div>
      Here&apos;s a random number from a subb: {num} <br />
      <Link href="/">Index</Link>
    </div>
  );
}

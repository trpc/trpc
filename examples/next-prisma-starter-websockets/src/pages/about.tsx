import Link from 'next/link';
import { useState } from 'react';
import { trpc } from 'utils/trpc';

export default function AboutPage() {
  const [num, setNumber] = useState<number>();
  trpc.useSubscription(['randomNumber', undefined], {
    onNext(n) {
      setNumber(n);
    },
  });
  return (
    <div>
      Here&apos;s a random number from a sub: {num} <br />
      <Link href="/">
        <a>Index</a>
      </Link>
    </div>
  );
}

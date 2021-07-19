import { useRouter } from 'next/dist/client/router';
import Link from 'next/link';
import { useState } from 'react';
import { trpc } from 'utils/trpc';

export default function AboutPage() {
  const [num, setNumber] = useState<number>();
  const router = useRouter();
  const enabled = router.query.on !== '0';
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
          onChange={(e) =>
            router.replace({
              query: {
                on: e.target.checked ? '1' : '0',
              },
            })
          }
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

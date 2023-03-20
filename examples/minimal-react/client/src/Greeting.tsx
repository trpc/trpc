import { Link } from 'react-router-dom';
import { trpc } from './utils/trpc';

export function Greeting() {
  const greeting = trpc.greeting.useQuery({ name: 'tRPC user' });

  return (
    <>
      <div>{greeting.data?.text}</div>;
      <div>
        <Link to="/test">Test</Link>
      </div>
    </>
  );
}

import { proxy, trpc } from '../utils/trpc';

export default function IndexPage() {
  const helloQuery = trpc.useQuery(['hello', { text: 'client' }]);

  // @ts-expect-error this shouldn't work
  trpc.useQuery(['foo']);

  const fooQuery2 = proxy.foo.useQuery();

  if (!helloQuery.data || !fooQuery2.data) {
    return (
      <div style={styles}>
        <h1>Loading...</h1>
      </div>
    );
  }
  return (
    <div style={styles}>
      {/* the type is define, it can be autocompleted */}
      <h1>{helloQuery.data.greeting}</h1>

      <pre>{JSON.stringify(fooQuery2.data, null, 4)}</pre>
    </div>
  );
}

const styles = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

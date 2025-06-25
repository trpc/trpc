import { trpc } from '../trpc/server/server';
import { Content } from './content';

export default function Page() {
  void trpc.greeting.queryOptions();

  return <Content />;
}

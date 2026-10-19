import { TRPCReactProvider } from '~/trpc/rq-client';

export default function Layout(props: Readonly<{ children: React.ReactNode }>) {
  return <TRPCReactProvider>{props.children}</TRPCReactProvider>;
}

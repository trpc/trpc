import { Provider } from './_provider';

export default function Layout(props: { children: React.ReactNode }) {
  return <Provider>{props.children}</Provider>;
}

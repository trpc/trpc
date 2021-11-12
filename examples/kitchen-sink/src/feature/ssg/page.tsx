import { ExamplePage } from 'utils/example';
import { props } from './meta';

export default function Page() {
  return (
    <>
      <ExamplePage {...props} />{' '}
    </>
  );
}

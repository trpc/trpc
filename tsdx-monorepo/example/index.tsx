import 'react-app-polyfill/ie11';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Slug } from 'packages/trpc/src';

const App = () => {
  return (
    <div data-test-id="zop">
      <Slug message="hello worldzz" />
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));

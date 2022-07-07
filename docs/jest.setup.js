import '@testing-library/jest-dom/extend-expect';
import React from 'react';

jest.mock(
  'next/link',
  () =>
    ({ children, ...rest }) =>
      React.cloneElement(children, { ...rest }),
);

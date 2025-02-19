import React from 'react';
import { trpc } from './trpc';

export function Component() {
  const y = trpc.useContext();
}

export function Component2() {
  const x = React.useContext(React.createContext(2));
}

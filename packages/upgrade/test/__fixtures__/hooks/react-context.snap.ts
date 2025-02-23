import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useTRPC } from './trpc';

export function Component() {
  const queryClient = useQueryClient();
}

const DummyContext = React.createContext(2);

export function Component2() {
  const value = React.useContext(DummyContext);
}

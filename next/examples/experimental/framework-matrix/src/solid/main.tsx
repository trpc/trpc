import { QueryClient } from '@tanstack/solid-query';
import { render } from 'solid-js/web';
import { makeClient } from '../trpc.ts';
import { App } from './App.tsx';
import '../styles.css';

render(
  () => <App client={makeClient()} queryClient={new QueryClient()} />,
  document.getElementById('app')!,
);

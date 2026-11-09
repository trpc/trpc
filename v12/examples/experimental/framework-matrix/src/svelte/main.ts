import { QueryClient } from '@tanstack/svelte-query';
import { mount } from 'svelte';
import { makeClient } from '../trpc.ts';
import App from './App.svelte';
import '../styles.css';

mount(App, {
  target: document.getElementById('app')!,
  props: { client: makeClient(), queryClient: new QueryClient() },
});

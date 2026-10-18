import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createClients, loadPage } from './trpc.ts';
import './styles.css';

const clients = createClients('/trpc');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App clients={clients} page={loadPage(clients)} />
  </StrictMode>,
);

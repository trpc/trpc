import { createSignal } from 'solid-js';
import { g } from '../api';

export const Email = () => {
  const [input, setInput] = createSignal('');

  return {
    dom: (
      <input
        placeholder="batched email"
        type="text"
        value={input()}
        onChange={(e) => setInput(e.currentTarget.value)}
      ></input>
    ),
    save: () => {
      void g.batched.mutate({ email: input() });
    },
  };
};

export const Name = () => {
  const [input, setInput] = createSignal('');

  return {
    dom: (
      <input
        placeholder="batched name"
        type="text"
        value={input()}
        onChange={(e) => setInput(e.currentTarget.value)}
      ></input>
    ),
    save: () => {
      void g.batched.mutate({ name: input() });
    },
  };
};

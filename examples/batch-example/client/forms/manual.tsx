import { createSignal } from 'solid-js';
import { g } from '../api';

export const User = () => {
  const [inputE, setInputE] = createSignal('');
  const [inputN, setInputN] = createSignal('');

  return {
    dom: {
      Email: (
        <input
          placeholder="manual email"
          type="text"
          value={inputE()}
          onChange={(e) => setInputE(e.currentTarget.value)}
        ></input>
      ),
      Name: (
        <input
          placeholder="manual name"
          type="text"
          value={inputN()}
          onChange={(e) => setInputN(e.currentTarget.value)}
        ></input>
      ),
    },
    save: () => {
      void g.manualBatch.mutate([{ email: inputE() }, { name: inputN() }]);
    },
  };
};

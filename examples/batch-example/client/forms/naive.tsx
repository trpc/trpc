import { createSignal } from "solid-js";
import { g } from "../api";

export const Email = () => {
  const [input, setInput] = createSignal("");

  return {
    dom: (
      <input
        placeholder="naive email"
        type="text"
        value={input()}
        onChange={(e) => setInput(e.currentTarget.value)}
      ></input>
    ),
    save: () => {
      g.naive.mutate({ email: input() });
    },
  };
};

export const Name = () => {
  const [input, setInput] = createSignal("");

  return {
    dom: (
      <input
        placeholder="naive name"
        type="text"
        value={input()}
        onChange={(e) => setInput(e.currentTarget.value)}
      ></input>
    ),
    save: () => {
      g.naive.mutate({ name: input() });
    },
  };
};

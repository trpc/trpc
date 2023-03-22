import { createSignal } from "solid-js";
import { g } from "../api";

type InferReturn<T> = T extends (input: infer U) => any ? U : never;
type Unwrap<T> = T extends (infer U)[] ? U : T;

let updates = [] as Unwrap<InferReturn<typeof g.manualBatch.mutate>>[];
const manualClientMutateBatcher = (
  input: Unwrap<InferReturn<typeof g.manualBatch.mutate>>
) => {
  updates.push(input);
  queueMicrotask(() => {
    if (updates.length === 0) return;
    g.manualBatch.mutate(updates);
    updates = [];
  });
};

export const Email = () => {
  const [input, setInput] = createSignal("");

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
      manualClientMutateBatcher({ email: input() });
    },
  };
};

export const Name = () => {
  const [input, setInput] = createSignal("");

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
      manualClientMutateBatcher({ name: input() });
    },
  };
};

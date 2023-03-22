import { createSignal } from "solid-js";

export const OptionModule = () => {
  const [option, setOption] = createSignal(1);
  const createOptionSelector = (option: number) => () => {
    setOption(option);
  };
  return {
    dom: (
      <span>
        <label for="1">Option 1</label>
        <input
          name="option"
          type="radio"
          id="1"
          onChange={createOptionSelector(1)}
        ></input>
        <label for="2">Option 2</label>
        <input
          name="option"
          type="radio"
          id="2"
          onChange={createOptionSelector(2)}
        ></input>
        <label for="3">Option 3</label>
        <input
          name="option"
          type="radio"
          id="3"
          onChange={createOptionSelector(3)}
        ></input>
        <label for="4">Option 4</label>
        <input
          name="option"
          type="radio"
          id="4"
          onChange={createOptionSelector(4)}
        ></input>
      </span>
    ),
    option,
  };
};

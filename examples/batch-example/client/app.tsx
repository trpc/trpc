import { render, Switch } from "solid-js/web";
import { Match } from "solid-js";
import { OptionModule } from "./unimportant";
import { Email as NaiveEmail, Name as NaiveName } from "./forms/naive";
import { Name as BatchedName, Email as BatchedEmail } from "./forms/batched";
import { User } from "./forms/manual";
import {
  Name as ComplexName,
  Email as ComplexEmail,
} from "./forms/manualComplex";

const App = () => {
  const { option, dom } = OptionModule();
  const [N, E] = [NaiveName(), NaiveEmail()];
  const [bN, bE] = [BatchedName(), BatchedEmail()];
  const [cN, cE] = [ComplexName(), ComplexEmail()];
  const {
    dom: { Name: mN, Email: mE },
    save,
  } = User();
  return (
    <div style={{ display: "flex", "flex-direction": "column" }}>
      <h1>Data Collection Application</h1>
      {dom}
      <Switch>
        <Match when={option() === 1}>
          {N.dom}
          {E.dom}
          <button
            onClick={() => {
              N.save();
              E.save();
            }}
          >
            Save
          </button>
        </Match>
        <Match when={option() === 2}>
          {bN.dom}
          {bE.dom}
          <button
            onClick={() => {
              bN.save();
              bE.save();
            }}
          >
            Save
          </button>
        </Match>
        <Match when={option() === 3}>
          {mN}
          {mE}
          <button onClick={save}>Save</button>
        </Match>
        <Match when={option() === 4}>
          {cN.dom}
          {cE.dom}
          <button
            onClick={() => {
              cN.save();
              cE.save();
            }}
          >
            Save
          </button>
        </Match>
      </Switch>
    </div>
  );
};

render(() => <App></App>, document.body);

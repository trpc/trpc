import { useEffect } from 'react';
import { openBilling } from './_actions';

function useActionState<TState, TPayload>(
  action: (
    state: Awaited<TState>,
    payload: TPayload,
  ) => TState | Promise<TState>,
  initialState: Awaited<TState>,
  permalink?: string,
): [
  state: Awaited<TState>,
  dispatch: () => void,
  pending: boolean,
  payload: TPayload | null,
] {
  throw new Error('waa');
}

function GoToBillingButton() {
  type State = {
    error: {
      message: string;
    };
  };
  const [state, dispatch, pending] = useActionState(
    openBilling as unknown as (
      state: State,
      payload: FormData,
    ) => { appId: string },
    {
      appId: '123',
    },
  );

  useEffect(() => {
    if (state.error) {
      alert(state.error.message);
    }
  }, [state.error]);

  return (
    // @ts-expect-error what
    <form action={dispatch}>
      <input type="hidden" name="appId" value="123" />
      <button disabled={pending}>go to billing</button>
    </form>
  );
}

export default function Page() {
  return (
    <>
      <GoToBillingButton />
    </>
  );
}

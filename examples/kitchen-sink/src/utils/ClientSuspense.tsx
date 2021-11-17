import {
  Component,
  ErrorInfo,
  ReactNode,
  Suspense,
  SuspenseProps,
} from 'react';

/**
 * Wrapper around `<Suspense />` which will render the `fallback` when on server
 * Can be simply replaced by `<Suspense />` once React 18 is ready.
 */
export const ClientSuspense = (props: SuspenseProps) => {
  return (
    <>
      {typeof window !== 'undefined' ? <Suspense {...props} /> : props.fallback}
    </>
  );
};

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return <h1>Sorry.. there was an error</h1>;
    }

    return this.props.children;
  }
}

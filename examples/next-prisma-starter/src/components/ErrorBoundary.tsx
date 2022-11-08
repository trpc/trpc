import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    console.log('-----------------------error');
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('componentDidCatch error:', error, errorInfo);
  }

  public render() {
    if (this.state.error) {
      return <h1>Sorry.. there was an error</h1>;
    }

    return this.props.children;
  }
}

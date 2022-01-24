import React, { Component, ErrorInfo, ReactNode } from 'react';
import NextError from 'next/error';
import { TRPCClientErrorLike } from '@trpc/client';
import { AppRouter } from '~/server/routers/_app';

interface Props {
  children: ReactNode;
}

interface State {
  error?: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {};

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { error: error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.error) {
      if (
        this.state.error &&
        typeof this.state.error === 'object' &&
        (this.state.error as any).message
      ) {
        const err = this.state.error as any as TRPCClientErrorLike<AppRouter>;
        return (
          <NextError
            title={err.message}
            statusCode={err.data?.httpStatus ?? 500}
          />
        );
      }
      return <NextError title={'Something went wrong'} statusCode={500} />;
    }

    return <>{this.props.children}</>;
  }
}

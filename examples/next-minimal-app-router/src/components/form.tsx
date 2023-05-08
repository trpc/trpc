'use client';

import * as React from 'react';
import { Button } from '~/components/button';

// Form that resets after submission
export function Form(
  props: {
    children: React.ReactNode;
    action: (fd: FormData) => Promise<void>;
  } & Omit<React.FormHTMLAttributes<HTMLFormElement>, 'action'>,
) {
  const ref = React.useRef<HTMLFormElement>(null);

  return (
    <form ref={ref} {...props}>
      {props.children}
      <Button
        type="submit"
        formAction={async (fd) => {
          await props.action(fd);
          ref.current?.reset();
        }}
      >
        Submit
      </Button>
    </form>
  );
}

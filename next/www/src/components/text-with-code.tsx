import { cn } from '@shared/ui/lib/utils';

import { textParts } from '~/content/inline-code.ts';

/**
 * A title or description, with its `` `code` `` spans as `<code>`: on a
 * muted chip in running text, or just monospaced in lists (`bare`).
 */
export function TextWithCode(props: {
  readonly bare?: boolean;
  readonly text: string;
}) {
  return textParts(props.text).map((part, index) =>
    part.code ? (
      <code
        className={cn(
          'font-mono text-[0.875em] [overflow-wrap:anywhere]',
          !props.bare &&
            'rounded-md bg-muted px-[0.3em] py-[0.125em] [box-decoration-break:clone]',
        )}
        key={index}
      >
        {part.text}
      </code>
    ) : (
      part.text
    ),
  );
}

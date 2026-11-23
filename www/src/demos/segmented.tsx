import type { ReactNode } from 'react';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@shared/ui/components/toggle-group';

/** One choice out of a few, as joined toggle buttons. */
export function Segmented<Value extends string>(props: {
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly onChange: (value: Value) => void;
  readonly options: ReadonlyArray<{
    readonly label: ReactNode;
    readonly value: Value;
  }>;
  readonly value: Value;
}) {
  return (
    <ToggleGroup
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      // On a narrow screen, the options scroll rather than widen the page
      className="max-w-full overflow-x-auto"
      onValueChange={(value) => {
        const next = props.options.find((option) => option.value === value[0]);
        if (next && next.value !== props.value) {
          props.onChange(next.value);
        }
      }}
      size="sm"
      spacing={0}
      value={[props.value]}
      variant="outline"
    >
      {props.options.map((option) => (
        <ToggleGroupItem
          className="text-muted-foreground aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-foreground"
          key={option.value}
          value={option.value}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

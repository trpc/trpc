import type { Tooltip } from '@shared/ui/components/tooltip';
import {
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  useRef,
  useState,
} from 'react';

type OpenChange = NonNullable<ComponentProps<typeof Tooltip>['onOpenChange']>;

/** How long a finger rests on a bubble before its tooltip shows. */
const holdMs = 400;

const isTouch = (pointerType: string | undefined) =>
  pointerType !== undefined && pointerType !== 'mouse';

/**
 * What a click on a bubble does. A mouse or the keyboard follows its link,
 * as hover or focus already showed its tooltip. A tap shows the tooltip
 * first, and follows the link only when an earlier tap showed it, not
 * hover on a device with both; a long press only shows it.
 */
export function tapAction(opts: {
  /** The pointer that pressed the bubble, if any: undefined for the keyboard. */
  readonly pointerType: string | undefined;
  /** Whether an earlier tap or long press showed its tooltip, still showing. */
  readonly tapped: boolean;
  /** Whether this press was held long enough to show it. */
  readonly held: boolean;
}): 'follow' | 'show' {
  return isTouch(opts.pointerType) && (!opts.tapped || opts.held)
    ? 'show'
    : 'follow';
}

/**
 * Tooltips that show on touch as they do on hover, one at a time: a tap or
 * a long press on a bubble shows its tooltip, and a tap anywhere else, or
 * on another bubble, hides it. Nothing shows until someone interacts, so
 * the server's markup is the browser's first render.
 */
export function useTapTooltips() {
  const [shown, setShown] = useState<string | null>(null);
  const tapped = useRef<string | null>(null);
  const pointer = useRef<string | undefined>(undefined);
  const held = useRef(false);
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stopHold = () => clearTimeout(hold.current);
  return (key: string) => {
    const onOpenChange: OpenChange = (open, details) => {
      // A touch press on the trigger is a tap, which `trigger.onClick` handles.
      if (
        !open &&
        details.reason === 'trigger-press' &&
        'pointerType' in details.event &&
        isTouch(String(details.event.pointerType))
      ) {
        return;
      }
      if (!open && tapped.current === key) {
        tapped.current = null;
      }
      setShown((now) => (open ? key : now === key ? null : now));
    };
    const show = () => {
      tapped.current = key;
      setShown(key);
    };
    return {
      root: { onOpenChange, open: shown === key },
      trigger: {
        onClick(event: MouseEvent) {
          const action = tapAction({
            held: held.current,
            pointerType: pointer.current,
            tapped: tapped.current === key,
          });
          pointer.current = undefined;
          held.current = false;
          if (action === 'show') {
            event.preventDefault();
            show();
          }
        },
        onContextMenu(event: MouseEvent) {
          if (isTouch(pointer.current)) {
            event.preventDefault();
          }
        },
        // A touch that ended without a click mustn't make a key press a tap.
        onKeyDown() {
          pointer.current = undefined;
          held.current = false;
        },
        onPointerCancel() {
          stopHold();
          pointer.current = undefined;
        },
        onPointerDown(event: PointerEvent) {
          pointer.current = event.pointerType;
          held.current = false;
          stopHold();
          if (isTouch(event.pointerType)) {
            hold.current = setTimeout(() => {
              held.current = true;
              show();
            }, holdMs);
          }
        },
        onPointerLeave: stopHold,
        onPointerUp: stopHold,
      },
    };
  };
}

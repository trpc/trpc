import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { Button } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';
import { upgradeSource, type UpgradeResult } from '@trpc12/upgrade';
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { highlight, theme } from '~/kitchen-sink/editor.tsx';

import { type CodemodSample, codemodSamples } from './samples.ts';

/** What the codemod made of `code`, or why it couldn't run. */
function upgrade(code: string, filename: string) {
  try {
    return upgradeSource(code, filename);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** One CodeMirror view: editable, or showing `code` as it changes. */
function Pane(props: {
  readonly code: string;
  readonly filename: string;
  readonly label: string;
  readonly onChange?: (code: string) => void;
  /** Where to put the cursor, `[line, column, nonce]`, 1-based; a new nonce moves it again. */
  readonly reveal?: readonly [number, number, number] | undefined;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  const editable = props.onChange !== undefined;

  useEffect(() => {
    if (!parent.current) {
      return undefined;
    }
    const created = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: props.code,
        extensions: [
          lineNumbers(),
          drawSelection(),
          syntaxHighlighting(highlight),
          javascript({ jsx: props.filename.endsWith('x'), typescript: true }),
          EditorState.tabSize.of(2),
          theme,
          EditorView.contentAttributes.of({
            'aria-label': `${props.label}, ${editable ? 'editable' : 'read-only'}`,
          }),
          ...(editable
            ? [
                history(),
                indentOnInput(),
                bracketMatching(),
                highlightActiveLine(),
                keymap.of([...defaultKeymap, ...historyKeymap]),
                EditorView.updateListener.of((update) => {
                  if (update.docChanged) {
                    onChange.current?.(update.state.doc.toString());
                  }
                }),
              ]
            : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
        ],
      }),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
    // Made once per file: the effects below replace its text.
  }, [props.filename]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === props.code) {
      return;
    }
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: props.code },
    });
  }, [props.code]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || !props.reveal) {
      return;
    }
    const [line, column] = props.reveal;
    const at = editor.state.doc.line(Math.min(line, editor.state.doc.lines));
    const position = Math.min(at.from + column - 1, at.to);
    editor.dispatch({
      selection: EditorSelection.cursor(position),
      effects: EditorView.scrollIntoView(position, { y: 'center' }),
    });
    editor.focus();
  }, [props.reveal]);

  return (
    <section aria-label={props.label} className="flex min-h-0 min-w-0 flex-col">
      <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {props.label}
      </p>
      <div className="h-80 min-h-0 overflow-hidden" ref={parent} />
    </section>
  );
}

/**
 * `@trpc12/upgrade` on the page: v11 code on the left, what the codemod
 * makes of it on the right, rewritten on each edit, and the steps it leaves
 * as `file:line:column` below. The parser is Oxc's WebAssembly build, which
 * needs no cross-origin isolation.
 */
export function CodemodPlayground() {
  const [sampleId, setSampleId] = useState(codemodSamples[0]!.id);
  const sample: CodemodSample =
    codemodSamples.find((each) => each.id === sampleId) ?? codemodSamples[0]!;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const code = edits[sample.id] ?? sample.code;
  const result: UpgradeResult | Error = useMemo(
    () => upgrade(code, sample.filename),
    [code, sample.filename],
  );
  const [reveal, setReveal] = useState<
    readonly [number, number, number] | undefined
  >(undefined);
  const notes = result instanceof Error ? [] : result.notes;

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
      data-codemod-playground-frame=""
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div
          aria-label="Samples"
          className="mr-auto flex flex-wrap gap-1"
          role="tablist"
        >
          {codemodSamples.map((each) => (
            <Button
              aria-selected={each.id === sample.id}
              key={each.id}
              onClick={() => {
                setSampleId(each.id);
                setReveal(undefined);
              }}
              role="tab"
              size="sm"
              variant={each.id === sample.id ? 'secondary' : 'ghost'}
            >
              {each.label}
            </Button>
          ))}
        </div>
        <Button
          disabled={edits[sample.id] === undefined}
          onClick={() =>
            setEdits((previous) => {
              const next = { ...previous };
              delete next[sample.id];
              return next;
            })
          }
          size="sm"
          variant="outline"
        >
          <RotateCcw />
          Reset code
        </Button>
      </div>
      <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
        <Pane
          code={code}
          filename={sample.filename}
          key={`v11-${sample.id}`}
          label={`v11: ${sample.filename}`}
          onChange={(next) =>
            setEdits((previous) => ({ ...previous, [sample.id]: next }))
          }
          reveal={reveal}
        />
        <Pane
          code={result instanceof Error ? code : result.code}
          filename={sample.filename}
          key={`v12-${sample.id}`}
          label={`v12: ${sample.filename}`}
        />
      </div>
      <div
        aria-live="polite"
        className="border-t px-3 py-2 text-sm"
        data-codemod-steps=""
      >
        {result instanceof Error ? (
          <p className="text-destructive">
            The codemod failed: {result.message}
          </p>
        ) : (
          <>
            <p
              className="text-xs text-muted-foreground"
              data-codemod-summary=""
            >
              {result.changed ? 'Rewritten' : 'Nothing to rewrite'},{' '}
              {notes.length === 1 ? '1 step' : `${notes.length} steps`} by hand
            </p>
            {notes.length > 0 ? (
              <ul className="mt-1.5 grid grid-cols-1 gap-1">
                {notes.map((note, index) => (
                  <li key={`${note.line}:${note.column}:${index}`}>
                    <button
                      className={cn(
                        'w-full rounded-md px-1.5 py-1 text-left font-mono text-xs [overflow-wrap:anywhere]',
                        'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                      )}
                      onClick={() =>
                        setReveal([note.line, note.column, Date.now()])
                      }
                      type="button"
                    >
                      <span className="text-muted-foreground">
                        {sample.filename}:{note.line}:{note.column}
                      </span>{' '}
                      {note.message}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

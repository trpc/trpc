import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  EditorState,
  type Extension,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

import type { DemoFile } from './modules.ts';

// The docs' code blocks use Shiki's GitHub themes; styles.css sets these
// variables for light and dark.
const highlight = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.controlKeyword,
    ],
    color: 'var(--ks-keyword)',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: 'var(--ks-string)',
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: 'var(--ks-constant)',
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: 'var(--ks-comment)',
    fontStyle: 'italic',
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.typeName,
      tags.className,
    ],
    color: 'var(--ks-function)',
  },
  {
    tag: [tags.definition(tags.variableName), tags.propertyName],
    color: 'var(--ks-constant)',
  },
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--ks-tag)' },
  { tag: tags.attributeName, color: 'var(--ks-function)' },
  { tag: tags.invalid, color: 'var(--ks-keyword)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--foreground)', padding: '8px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--muted-foreground)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 50%, transparent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':
    {
      backgroundColor:
        'color-mix(in oklab, var(--brand) 22%, transparent) !important',
    },
  '.cm-error-line': {
    backgroundColor: 'color-mix(in oklab, var(--destructive) 14%, transparent)',
  },
});

const setErrorLine = StateEffect.define<number | undefined>();

/** The line the latest build failed on, marked until it builds again. */
const errorLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(lines, transaction) {
    let next = lines.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setErrorLine)) {
        const line = effect.value;
        next =
          line === undefined || line > transaction.state.doc.lines
            ? Decoration.none
            : Decoration.set([
                Decoration.line({ class: 'cm-error-line' }).range(
                  transaction.state.doc.line(line).from,
                ),
              ]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function stateOf(code: string, extensions: Extension) {
  return EditorState.create({ doc: code, extensions });
}

/**
 * The demo's files in one CodeMirror view. Each file keeps its own state,
 * so switching tabs keeps its undo history, cursor and scroll.
 */
export function CodeEditor(props: {
  /** Which line of `file` the build failed on, if it did. */
  readonly errorLine: number | undefined;
  readonly file: string;
  readonly files: ReadonlyArray<DemoFile>;
  readonly onChange: (name: string, code: string) => void;
  /** Bumped by "Reset": every file goes back to `files`, without history. */
  readonly version: number;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const states = useRef(new Map<string, EditorState>());
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  const files = useRef(props.files);
  files.current = props.files;
  const current = useRef(props.file);

  const extensionsFor = (name: string): Extension => [
    lineNumbers(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    javascript({ jsx: name.endsWith('.tsx'), typescript: true }),
    syntaxHighlighting(highlight),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorState.tabSize.of(2),
    errorLine,
    theme,
    EditorView.contentAttributes.of({ 'aria-label': `${name}, editable` }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange.current(name, update.state.doc.toString());
      }
    }),
  ];

  const stateFor = (name: string) => {
    const existing = states.current.get(name);
    if (existing) {
      return existing;
    }
    const code = files.current.find((file) => file.name === name)?.code ?? '';
    const state = stateOf(code, extensionsFor(name));
    states.current.set(name, state);
    return state;
  };

  useEffect(() => {
    if (!parent.current) {
      return undefined;
    }
    const created = new EditorView({
      parent: parent.current,
      state: stateFor(current.current),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
    // Made once: the effects below swap its state.
  }, []);

  useEffect(() => {
    states.current.clear();
    view.current?.setState(stateFor(current.current));
  }, [props.version]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || current.current === props.file) {
      return;
    }
    states.current.set(current.current, editor.state);
    current.current = props.file;
    editor.setState(stateFor(props.file));
  }, [props.file]);

  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLine.of(props.errorLine) });
  }, [props.errorLine, props.file]);

  return <div className="h-full min-h-0 overflow-hidden" ref={parent} />;
}

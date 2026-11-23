export function JsonBlock(props: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
      <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs">
        {JSON.stringify(props.value, null, 2)}
      </pre>
    </div>
  );
}

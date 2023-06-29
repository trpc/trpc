export function JsonPreTag(props: { object: unknown }) {
  return (
    <pre className="bg-muted relative overflow-x-auto rounded p-4 px-[0.33rem] py-[0.33rem] font-mono text-sm font-semibold">
      {JSON.stringify(props.object, null, 4)}
    </pre>
  );
}

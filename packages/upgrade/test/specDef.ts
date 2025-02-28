export type SpecRun = (Component: React.FC) => Promise<void>;
export type SpecDefFile = { run: SpecRun };
export type ComponentFile = Record<string, React.FC>;

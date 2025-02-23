export type SpecRun = (Component: React.Component) => Promise<void>;
export type SpecDefFile = { run: SpecRun };
export type ComponentFile = { Component: React.Component };

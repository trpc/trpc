export type ContentTypeHandler = {
  isMatch: (opts: Request) => boolean;
  getInputs: (req: Request, searchParams: URLSearchParams) => Promise<unknown>;
  batching: boolean;
  transform: boolean;
};

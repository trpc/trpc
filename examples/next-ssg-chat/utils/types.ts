// --------------- Original implementation -----------------------
// Taken from https://twitter.com/diegohaz/status/1309644466219819008

export type PathImpl<T, K extends keyof T> = K extends string
  ? T[K] extends Record<string, any>
    ? T[K] extends ArrayLike<any>
      ? K | `${K}.${PathImpl<T[K], Exclude<keyof T[K], keyof any[]>>}`
      : K | `${K}.${PathImpl<T[K], keyof T[K]>}`
    : K
  : never;

export type Path<T> = PathImpl<T, keyof T> | keyof T;

export type PathValue<
  T,
  P extends Path<T>
> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? Rest extends Path<T[K]>
      ? PathValue<T[K], Rest>
      : never
    : never
  : P extends keyof T
  ? T[P]
  : never;

// --------------- Formik specific implementation ------------------
// works similarly, but only allows you to select the deepest object
// and arrays are simply excluded

export type LeafPathImpl<T, K extends keyof T> = K extends string
  ? T[K] extends Record<string, any>
    ? T[K] extends ArrayLike<any>
      ? never
      : `${K}.${LeafPathImpl<T[K], keyof T[K]>}`
    : K
  : never;

export type LeafPath<T> = LeafPathImpl<T, keyof T>;

// "tests"
const object = {
  deep: {
    value: "string",
    arr: ["something"],
  },
  plain: "",
};

type Obj = typeof object;
type TPaths = LeafPath<typeof object>; // <-- inspect this

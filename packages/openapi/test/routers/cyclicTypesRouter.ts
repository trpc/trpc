import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

// ---------- Plain TypeScript recursive types ----------

/** A tree node with children of the same type */
interface TreeNode {
  value: string;
  children: TreeNode[];
}

/** A linked list with nullable self-reference */
interface LinkedListNode {
  value: number;
  next: LinkedListNode | null;
}

/** A graph node with multiple neighbors (cyclic graph structure) */
interface GraphNode {
  id: string;
  label: string;
  neighbors: GraphNode[];
}

/** Mutual recursion: Person references Pet, Pet references Person */
interface Person {
  name: string;
  pets: Pet[];
}

interface Pet {
  name: string;
  owner: Person;
}

/** JSON-like recursive type (union of primitives, arrays, and objects) */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Recursive type with optional self-reference */
interface Comment {
  text: string;
  replies?: Comment[];
}

/** Recursive type nested inside another structure */
interface Department {
  name: string;
  manager: string;
  subdepartments: Department[];
}

interface Organization {
  name: string;
  rootDepartment: Department;
}

/** Deeply nested recursive - a filesystem-like structure */
interface FileSystemEntry {
  name: string;
  entries: FileSystemEntry[];
  parent: FileSystemEntry | null;
}

/** Recursive type through a Record/Map */
interface CategoryMap {
  name: string;
  children: Record<string, CategoryMap>;
}

/** Triple mutual recursion: A -> B -> C -> A */
interface NodeA {
  value: string;
  toB: NodeB;
}

interface NodeB {
  value: number;
  toC: NodeC;
}

interface NodeC {
  value: boolean;
  toA: NodeA | null;
}

// ---------- Zod recursive schemas ----------

type ZodCategory = {
  name: string;
  subcategories: ZodCategory[];
};

const zodCategorySchema: z.ZodType<ZodCategory> = z.lazy(() =>
  z.object({
    name: z.string(),
    subcategories: z.array(zodCategorySchema),
  }),
);

type ZodTreeNode = {
  value: string;
  children: ZodTreeNode[];
};

const zodTreeNodeSchema: z.ZodType<ZodTreeNode> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.array(zodTreeNodeSchema),
  }),
);

type ZodLinkedList = {
  value: number;
  next: ZodLinkedList | null;
};

const zodLinkedListSchema: z.ZodType<ZodLinkedList> = z.lazy(() =>
  z.object({
    value: z.number(),
    next: zodLinkedListSchema.nullable(),
  }),
);

type ZodComment = {
  text: string;
  replies?: ZodComment[];
};

const zodCommentSchema: z.ZodType<ZodComment> = z.lazy(() =>
  z.object({
    text: z.string(),
    replies: z.array(zodCommentSchema).optional(),
  }),
);

// ---------- Router ----------

export const CyclicTypesRouter = t.router({
  // --- Plain TS recursive types ---
  tsTypes: t.router({
    /** Tree: children is array of self */
    tree: t.procedure.query(
      (): TreeNode => ({
        value: 'root',
        children: [{ value: 'child', children: [] }],
      }),
    ),

    /** Linked list: nullable self-reference */
    linkedList: t.procedure.query(
      (): LinkedListNode => ({
        value: 1,
        next: { value: 2, next: null },
      }),
    ),

    /** Graph: array of self (cyclic) */
    graph: t.procedure.query((): GraphNode => {
      const node: GraphNode = { id: '1', label: 'A', neighbors: [] };
      return node;
    }),

    /** Mutual recursion: Person <-> Pet */
    mutualRecursion: t.procedure.query(
      (): Person => ({
        name: 'Alice',
        pets: [{ name: 'Rex', owner: { name: 'Alice', pets: [] } }],
      }),
    ),

    /** JSON-like recursive union type */
    jsonValue: t.procedure.query((): { data: JsonValue } => ({
      data: { key: [1, 'two', true, null, { nested: 'value' }] },
    })),

    /** Optional self-reference */
    comment: t.procedure.query(
      (): Comment => ({
        text: 'Hello',
        replies: [{ text: 'Reply' }],
      }),
    ),

    /** Recursive type nested inside a non-recursive wrapper */
    organization: t.procedure.query(
      (): Organization => ({
        name: 'Acme',
        rootDepartment: {
          name: 'Engineering',
          manager: 'Alice',
          subdepartments: [],
        },
      }),
    ),

    /** FileSystem with both array and nullable self-reference */
    fileSystem: t.procedure.query(
      (): FileSystemEntry => ({
        name: 'root',
        entries: [{ name: 'file.txt', entries: [], parent: null }],
        parent: null,
      }),
    ),

    /** Recursive type through Record */
    categoryMap: t.procedure.query(
      (): CategoryMap => ({
        name: 'root',
        children: {
          child1: { name: 'child1', children: {} },
        },
      }),
    ),

    /** Triple mutual recursion: A -> B -> C -> A */
    tripleRecursion: t.procedure.query(
      (): NodeA => ({
        value: 'a',
        toB: {
          value: 1,
          toC: {
            value: true,
            toA: null,
          },
        },
      }),
    ),
  }),

  // --- Zod z.lazy() recursive inputs ---
  zodTypes: t.router({
    /** Zod recursive category tree */
    category: t.procedure.input(zodCategorySchema).query(({ input }) => input),

    /** Zod recursive tree node */
    treeNode: t.procedure.input(zodTreeNodeSchema).query(({ input }) => input),

    /** Zod recursive linked list with nullable */
    linkedList: t.procedure
      .input(zodLinkedListSchema)
      .query(({ input }) => input),

    /** Zod recursive comment with optional */
    comment: t.procedure.input(zodCommentSchema).query(({ input }) => input),
  }),
});

export type CyclicTypesRouter = typeof CyclicTypesRouter;

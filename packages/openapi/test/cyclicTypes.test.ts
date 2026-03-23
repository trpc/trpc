import * as path from 'node:path';
import type { OpenAPIV3_1 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import type { OpenAPIDocument } from '../src/generate';
import { generateOpenAPIDocument } from '../src/generate';

type SchemaObject = OpenAPIV3_1.SchemaObject;
type ReferenceObject = OpenAPIV3_1.ReferenceObject;
type SchemaOrRef = SchemaObject | ReferenceObject;

const routerPath = path.resolve(__dirname, 'routers/cyclicTypesRouter.ts');

function isRef(s: SchemaOrRef): s is ReferenceObject {
  return '$ref' in s;
}

/** Resolve a schema that may be a $ref into the actual schema object. */
function resolveSchema(
  schema: SchemaOrRef,
  doc: OpenAPIDocument,
): SchemaObject | undefined {
  if (!isRef(schema)) return schema;
  const name = schema.$ref.replace('#/components/schemas/', '');
  const resolved = doc.components?.schemas?.[name];
  if (!resolved || isRef(resolved)) return undefined;
  return resolved;
}

/** Extract the procedure's output data schema from the tRPC envelope. */
function unwrapSuccessData(
  schema: SchemaOrRef,
  doc: OpenAPIDocument,
): SchemaObject | undefined {
  const resolved = resolveSchema(schema, doc);
  if (!resolved) return undefined;
  const result = resolved.properties?.['result'];
  if (!result || isRef(result)) return undefined;
  const data = result.properties?.['data'];
  if (!data) return undefined;
  return resolveSchema(data, doc);
}

/** Get the output data schema for a given procedure path. */
function getOutputData(
  doc: OpenAPIDocument,
  procPath: string,
): SchemaObject | undefined {
  const pathItem = doc.paths?.[`/${procPath}`];
  if (!pathItem) return undefined;
  const op = pathItem.get;
  const response = op?.responses?.['200'];
  if (!response || '$ref' in response) return undefined;
  const schema = response.content?.['application/json']?.schema;
  return schema ? unwrapSuccessData(schema, doc) : undefined;
}

/** Get a named schema from components/schemas. */
function getSchema(doc: OpenAPIDocument, name: string): SchemaObject {
  const schema = doc.components?.schemas?.[name];
  if (!schema || isRef(schema)) {
    throw new Error(`Expected SchemaObject for "${name}"`);
  }
  return schema;
}

/** Get all named schemas from components/schemas. */
function getSchemas(doc: OpenAPIDocument): Record<string, SchemaOrRef> {
  return doc.components?.schemas ?? {};
}

describe('cyclic types', () => {
  let doc: OpenAPIDocument;

  beforeAll(async () => {
    doc = await generateOpenAPIDocument(routerPath, {
      exportName: 'CyclicTypesRouter',
      title: 'Cyclic Types API',
      version: '1.0.0',
    });
  });

  // ----------------------------------------------------------------
  // Plain TypeScript recursive types
  // ----------------------------------------------------------------

  describe('plain TS recursive types', () => {
    it('handles TreeNode (children: TreeNode[])', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('TreeNode');
      const treeNode = getSchema(doc, 'TreeNode');

      expect(treeNode.type).toBe('object');
      expect(treeNode.properties?.['value']).toEqual({ type: 'string' });
      expect(treeNode.properties?.['children']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/TreeNode' },
      });
      expect(treeNode.required).toContain('value');
      expect(treeNode.required).toContain('children');

      // The procedure output should reference TreeNode
      const pathItem = doc.paths?.['/tsTypes.tree'];
      expect(pathItem).toBeDefined();
      if (!pathItem) return;
      const response = pathItem.get?.responses?.['200'];
      if (!response || '$ref' in response) throw new Error('unexpected');
      const responseSchema = response.content?.['application/json']?.schema;
      if (!responseSchema || isRef(responseSchema))
        throw new Error('unexpected');
      const result = responseSchema.properties?.['result'];
      if (!result || isRef(result)) throw new Error('unexpected');
      const data = result.properties?.['data'];
      expect(data).toEqual({ $ref: '#/components/schemas/TreeNode' });
    });

    it('handles LinkedListNode (next: LinkedListNode | null)', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('LinkedListNode');
      const node = getSchema(doc, 'LinkedListNode');

      expect(node.type).toBe('object');
      expect(node.properties?.['value']).toEqual({ type: 'number' });
      expect(node.properties?.['next']).toEqual({
        oneOf: [
          { $ref: '#/components/schemas/LinkedListNode' },
          { type: 'null' },
        ],
      });
    });

    it('handles GraphNode (neighbors: GraphNode[])', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('GraphNode');
      const graphNode = getSchema(doc, 'GraphNode');

      expect(graphNode.type).toBe('object');
      expect(graphNode.properties?.['id']).toEqual({ type: 'string' });
      expect(graphNode.properties?.['label']).toEqual({ type: 'string' });
      expect(graphNode.properties?.['neighbors']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/GraphNode' },
      });
    });

    it('handles mutual recursion (Person <-> Pet)', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('Person');
      expect(schemas).toHaveProperty('Pet');

      const person = getSchema(doc, 'Person');
      expect(person.type).toBe('object');
      expect(person.properties?.['name']).toEqual({ type: 'string' });
      expect(person.properties?.['pets']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Pet' },
      });

      const pet = getSchema(doc, 'Pet');
      expect(pet.type).toBe('object');
      expect(pet.properties?.['name']).toEqual({ type: 'string' });
      expect(pet.properties?.['owner']).toEqual({
        $ref: '#/components/schemas/Person',
      });
    });

    it('handles JsonValue recursive union type', () => {
      const data = getOutputData(doc, 'tsTypes.jsonValue');
      expect(data).toBeDefined();
      expect(data?.properties).toHaveProperty('data');
    });

    it('handles Comment with optional self-reference', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('Comment');
      const comment = getSchema(doc, 'Comment');

      expect(comment.type).toBe('object');
      expect(comment.properties?.['text']).toEqual({ type: 'string' });
      // replies is optional, so it should NOT be in required
      expect(comment.required).toContain('text');
      expect(comment.required).not.toContain('replies');

      // replies should reference Comment
      expect(comment.properties?.['replies']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Comment' },
      });
    });

    it('handles recursive type nested inside a non-recursive wrapper (Organization -> Department)', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('Department');
      const dept = getSchema(doc, 'Department');

      expect(dept.type).toBe('object');
      expect(dept.properties?.['name']).toEqual({ type: 'string' });
      expect(dept.properties?.['manager']).toEqual({ type: 'string' });
      expect(dept.properties?.['subdepartments']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Department' },
      });

      // Organization output should reference Department
      const data = getOutputData(doc, 'tsTypes.organization');
      expect(data).toBeDefined();
      expect(data?.properties?.['rootDepartment']).toEqual({
        $ref: '#/components/schemas/Department',
      });
    });

    it('handles FileSystemEntry with both array and nullable self-reference', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('FileSystemEntry');
      const entry = getSchema(doc, 'FileSystemEntry');

      expect(entry.type).toBe('object');
      expect(entry.properties?.['name']).toEqual({ type: 'string' });
      expect(entry.properties?.['entries']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/FileSystemEntry' },
      });
      expect(entry.properties?.['parent']).toEqual({
        oneOf: [
          { $ref: '#/components/schemas/FileSystemEntry' },
          { type: 'null' },
        ],
      });
    });

    it('handles recursive type through Record (CategoryMap)', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('CategoryMap');
      const catMap = getSchema(doc, 'CategoryMap');

      expect(catMap.type).toBe('object');
      expect(catMap.properties?.['name']).toEqual({ type: 'string' });
      const children = catMap.properties?.['children'];
      if (!children || isRef(children)) throw new Error('unexpected');
      expect(children.type).toBe('object');
      expect(children.additionalProperties).toEqual({
        $ref: '#/components/schemas/CategoryMap',
      });
    });

    it('handles triple mutual recursion (NodeA -> NodeB -> NodeC -> NodeA)', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('NodeA');
      expect(schemas).toHaveProperty('NodeB');
      expect(schemas).toHaveProperty('NodeC');

      const nodeA = getSchema(doc, 'NodeA');
      expect(nodeA.type).toBe('object');
      expect(nodeA.properties?.['value']).toEqual({ type: 'string' });
      expect(nodeA.properties?.['toB']).toEqual({
        $ref: '#/components/schemas/NodeB',
      });

      const nodeB = getSchema(doc, 'NodeB');
      expect(nodeB.type).toBe('object');
      expect(nodeB.properties?.['value']).toEqual({ type: 'number' });
      expect(nodeB.properties?.['toC']).toEqual({
        $ref: '#/components/schemas/NodeC',
      });

      const nodeC = getSchema(doc, 'NodeC');
      expect(nodeC.type).toBe('object');
      expect(nodeC.properties?.['value']).toEqual({ type: 'boolean' });
      expect(nodeC.properties?.['toA']).toEqual({
        oneOf: [{ $ref: '#/components/schemas/NodeA' }, { type: 'null' }],
      });
    });
  });

  // ----------------------------------------------------------------
  // Zod z.lazy() recursive types
  // ----------------------------------------------------------------

  describe('Zod z.lazy() recursive types', () => {
    it('handles Zod recursive category (output resolves via inferred return)', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('ZodCategory');
      const cat = getSchema(doc, 'ZodCategory');

      expect(cat.type).toBe('object');
      expect(cat.properties?.['name']).toEqual({ type: 'string' });
      expect(cat.properties?.['subcategories']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/ZodCategory' },
      });

      // The output (inferred from `({ input }) => input`) references ZodCategory
      const data = getOutputData(doc, 'zodTypes.category');
      expect(data).toBeDefined();
      expect(data?.properties?.['name']).toEqual({ type: 'string' });
    });

    it('handles Zod recursive tree node', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('ZodTreeNode');
      const tree = getSchema(doc, 'ZodTreeNode');

      expect(tree.type).toBe('object');
      expect(tree.properties?.['value']).toEqual({ type: 'string' });
      expect(tree.properties?.['children']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/ZodTreeNode' },
      });
    });

    it('handles Zod recursive linked list with nullable', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('ZodLinkedList');
      const list = getSchema(doc, 'ZodLinkedList');

      expect(list.type).toBe('object');
      expect(list.properties?.['value']).toEqual({ type: 'number' });
      expect(list.properties?.['next']).toEqual({
        oneOf: [
          { $ref: '#/components/schemas/ZodLinkedList' },
          { type: 'null' },
        ],
      });
    });

    it('handles Zod recursive comment with optional', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('ZodComment');
      const comment = getSchema(doc, 'ZodComment');

      expect(comment.type).toBe('object');
      expect(comment.properties?.['text']).toEqual({ type: 'string' });
      expect(comment.required).toContain('text');
      expect(comment.required).not.toContain('replies');
      expect(comment.properties?.['replies']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/ZodComment' },
      });
    });
  });

  // ----------------------------------------------------------------
  // General structural guarantees
  // ----------------------------------------------------------------

  describe('structural guarantees', () => {
    it('does not produce any empty {} schemas for recursive types', () => {
      const schemas = getSchemas(doc);
      // An empty {} would indicate the depth limit was hit
      for (const schema of Object.values(schemas)) {
        const keys = Object.keys(schema);
        expect(keys.length).toBeGreaterThan(0);
      }
    });

    it('all $ref targets exist in components/schemas', () => {
      const schemas = getSchemas(doc);
      const specStr = JSON.stringify(doc);
      const refPattern = /"\$ref":"#\/components\/schemas\/([^"]+)"/g;
      let match;
      while ((match = refPattern.exec(specStr)) !== null) {
        const refName = match[1];
        if (refName) {
          expect(schemas).toHaveProperty(refName);
        }
      }
    });

    it('generates valid paths for all procedures', () => {
      const expectedPaths = [
        '/tsTypes.tree',
        '/tsTypes.linkedList',
        '/tsTypes.graph',
        '/tsTypes.mutualRecursion',
        '/tsTypes.jsonValue',
        '/tsTypes.comment',
        '/tsTypes.organization',
        '/tsTypes.fileSystem',
        '/tsTypes.categoryMap',
        '/tsTypes.tripleRecursion',
        '/zodTypes.category',
        '/zodTypes.treeNode',
        '/zodTypes.linkedList',
        '/zodTypes.comment',
      ];

      for (const p of expectedPaths) {
        expect(doc.paths).toHaveProperty(p);
      }
    });
  });
});

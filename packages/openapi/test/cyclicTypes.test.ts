import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import type { Document } from '../src/types';
import {
  getOutputData,
  getResponseSchema,
  getSchemas,
  isRef,
  requireProperty,
  requireSchema,
  requireSchemaObject,
} from './types';

const routerPath = path.resolve(__dirname, 'routers/cyclicTypesRouter.ts');

describe('cyclic types', () => {
  let doc: Document;

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
      const treeNode = requireSchema(doc, 'TreeNode');

      expect(treeNode.type).toBe('object');
      expect(treeNode.properties?.['value']).toEqual({ type: 'string' });
      expect(treeNode.properties?.['children']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/TreeNode' },
      });
      expect(treeNode.required).toContain('value');
      expect(treeNode.required).toContain('children');

      // The procedure output should reference TreeNode
      const responseSchema = requireSchemaObject(
        getResponseSchema(doc, 'tsTypes.tree'),
        doc,
        'tsTypes.tree response',
      );
      const result = requireSchemaObject(
        requireProperty(responseSchema, 'result'),
        doc,
        'tsTypes.tree result',
      );
      expect(requireProperty(result, 'data')).toEqual({
        $ref: '#/components/schemas/TreeNode',
      });
    });

    it('handles LinkedListNode (next: LinkedListNode | null)', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('LinkedListNode');
      const node = requireSchema(doc, 'LinkedListNode');

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
      const graphNode = requireSchema(doc, 'GraphNode');

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

      const person = requireSchema(doc, 'Person');
      expect(person.type).toBe('object');
      expect(person.properties?.['name']).toEqual({ type: 'string' });
      expect(person.properties?.['pets']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Pet' },
      });

      const pet = requireSchema(doc, 'Pet');
      expect(pet.type).toBe('object');
      expect(pet.properties?.['name']).toEqual({ type: 'string' });
      expect(pet.properties?.['owner']).toEqual({
        $ref: '#/components/schemas/Person',
      });
    });

    it('handles JsonValue recursive union type', () => {
      const jsonValue = requireSchema(doc, 'JsonValue');
      expect(jsonValue.oneOf).toHaveLength(6);
      expect(jsonValue.oneOf).toEqual(
        expect.arrayContaining([
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'null' },
          {
            type: 'array',
            items: { $ref: '#/components/schemas/JsonValue' },
          },
          {
            type: 'object',
            additionalProperties: {
              $ref: '#/components/schemas/JsonValue',
            },
          },
        ]),
      );

      const data = getOutputData(doc, 'tsTypes.jsonValue');
      expect(data).toBeDefined();
      expect(data?.properties?.['data']).toEqual({
        $ref: '#/components/schemas/JsonValue',
      });
    });

    it('handles Comment with optional self-reference', () => {
      const schemas = getSchemas(doc);
      expect(schemas).toHaveProperty('Comment');
      const comment = requireSchema(doc, 'Comment');

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
      const dept = requireSchema(doc, 'Department');

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
      const entry = requireSchema(doc, 'FileSystemEntry');

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
      const catMap = requireSchema(doc, 'CategoryMap');

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

      const nodeA = requireSchema(doc, 'NodeA');
      expect(nodeA.type).toBe('object');
      expect(nodeA.properties?.['value']).toEqual({ type: 'string' });
      expect(nodeA.properties?.['toB']).toEqual({
        $ref: '#/components/schemas/NodeB',
      });

      const nodeB = requireSchema(doc, 'NodeB');
      expect(nodeB.type).toBe('object');
      expect(nodeB.properties?.['value']).toEqual({ type: 'number' });
      expect(nodeB.properties?.['toC']).toEqual({
        $ref: '#/components/schemas/NodeC',
      });

      const nodeC = requireSchema(doc, 'NodeC');
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
      const cat = requireSchema(doc, 'ZodCategory');

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
      const tree = requireSchema(doc, 'ZodTreeNode');

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
      const list = requireSchema(doc, 'ZodLinkedList');

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
      const comment = requireSchema(doc, 'ZodComment');

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

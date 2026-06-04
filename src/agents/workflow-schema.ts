/**
 * JSON Schema for {@link WorkflowSpec}.
 *
 * Useful for: (1) validating workflows loaded from disk before
 * compile; (2) generating a form schema in a UI; (3) documentation
 * generation. Compatible with `ajv`, `@cfworker/json-schema`, etc.
 */

export const workflowJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://personal-assistant.local/workflow-spec.v1.json',
  title: 'WorkflowSpec',
  type: 'object',
  required: ['name', 'nodes', 'edges', 'entry'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    version: { type: 'string' },
    entry: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          data: { type: 'object', additionalProperties: true },
          position: {
            type: 'object',
            required: ['x', 'y'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'target'],
        properties: {
          id: { type: 'string' },
          source: { type: 'string' },
          target: { type: 'string' },
          sourceHandle: { type: 'string' },
          targetHandle: { type: 'string' },
          condition: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
  },
} as const;

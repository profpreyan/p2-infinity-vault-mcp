#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const LIBRARY_URL = 'https://p2infinityvault.vercel.app/library.json';

let library = null;

async function loadLibrary() {
  if (library) return library;
  const res = await fetch(LIBRARY_URL);
  if (!res.ok) throw new Error('Failed to fetch library.json');
  library = await res.json();
  return library;
}

const server = new Server(
  {
    name: 'p2-infinity-vault',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_library',
        description: 'Search characters, locations, or grabs by name, origin, tags, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term (name, ethnicity, tag, etc.)' },
            kind: { type: 'string', description: 'Optional: character, location, grab, or all', enum: ['character', 'location', 'grab', 'all'] },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_by_id',
        description: 'Get full details of an item by its ID (e.g. CH-097)',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Item ID like CH-097 or LOC-011' },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_characters',
        description: 'List all characters (optionally filter by group/heritage)',
        inputSchema: {
          type: 'object',
          properties: {
            heritage: { type: 'string', description: 'Optional heritage/group filter' },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const lib = await loadLibrary();

  if (name === 'search_library') {
    const q = (args.query || '').toLowerCase();
    const kind = args.kind || 'all';
    const results = lib.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false;
      const searchable = [
        item.name,
        item.subtitle,
        item.id,
        item.facets?.group,
        item.details?.['Ethnicity detail'],
        ...(item.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            results.map((i) => ({
              id: i.id,
              kind: i.kind,
              name: i.name,
              subtitle: i.subtitle,
              ethnicity: i.details?.['Ethnicity detail'],
              group: i.facets?.group,
            })),
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === 'get_by_id') {
    const item = lib.find((i) => i.id === args.id);
    if (!item) {
      return { content: [{ type: 'text', text: 'Not found' }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(item, null, 2) }],
    };
  }

  if (name === 'list_characters') {
    let chars = lib.filter((i) => i.kind === 'character');
    if (args.heritage) {
      const h = args.heritage.toLowerCase();
      chars = chars.filter(
        (i) =>
          (i.facets?.group || '').toLowerCase().includes(h) ||
          (i.details?.['Ethnicity detail'] || '').toLowerCase().includes(h)
      );
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            chars.map((i) => ({
              id: i.id,
              name: i.name,
              subtitle: i.subtitle,
              ethnicity: i.details?.['Ethnicity detail'],
            })),
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error('Unknown tool');
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('P2 Infinity Vault MCP server running on stdio');

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

const LIBRARY_URL = 'https://p2infinityvault.vercel.app/library.json';

let library: any[] | null = null;

async function loadLibrary(): Promise<any[]> {
  if (library) return library;
  const res = await fetch(LIBRARY_URL, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Failed to fetch library.json');
  const data = await res.json();
  library = data;
  return data;
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'search_library',
      'Search characters, locations, or grabs by name, origin, ethnicity, tags, etc.',
      {
        query: z.string().describe('Search term (name, ethnicity, tag, subtitle, etc.)'),
        kind: z.enum(['character', 'location', 'grab', 'all']).optional().describe('Filter by kind'),
      },
      async ({ query, kind = 'all' }) => {
        const lib = await loadLibrary();
        const q = query.toLowerCase();
        const results = lib.filter((item: any) => {
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
                results.map((i: any) => ({
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
    );

    server.tool(
      'get_by_id',
      'Get full details of an item by its ID (e.g. CH-097 for Lena)',
      {
        id: z.string().describe('Item ID like CH-097 or LOC-011'),
      },
      async ({ id }) => {
        const lib = await loadLibrary();
        const item = lib.find((i: any) => i.id === id);
        if (!item) {
          return { content: [{ type: 'text', text: 'Not found' }] };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(item, null, 2) }],
        };
      }
    );

    server.tool(
      'list_characters',
      'List all characters, optionally filtered by heritage/group',
      {
        heritage: z.string().optional().describe('Optional heritage or group filter (e.g. Germanic, White / European)'),
      },
      async ({ heritage }) => {
        const lib = await loadLibrary();
        let chars = lib.filter((i: any) => i.kind === 'character');
        if (heritage) {
          const h = heritage.toLowerCase();
          chars = chars.filter(
            (i: any) =>
              (i.facets?.group || '').toLowerCase().includes(h) ||
              (i.details?.['Ethnicity detail'] || '').toLowerCase().includes(h)
          );
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                chars.map((i: any) => ({
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
    );
  },
  {},
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: false,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
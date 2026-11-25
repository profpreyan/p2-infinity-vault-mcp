import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

const LIBRARY_URL = 'https://p2infinityvault.vercel.app/library.json';
const GRABS_URL = 'https://p2infinityvault.vercel.app/grabs.json';
const R2 = 'https://pub-4f53ca7eceac40e3bb1575eb395ca7f0.r2.dev/grabs';

let library: any[] | null = null;
let grabs: { videos: any[]; shots: any[] } | null = null;

async function loadLibrary(): Promise<any[]> {
  if (library) return library;
  const res = await fetch(LIBRARY_URL, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Failed to fetch library.json');
  library = await res.json();
  return library!;
}

async function loadGrabs(): Promise<{ videos: any[]; shots: any[] }> {
  if (grabs) return grabs;
  const res = await fetch(GRABS_URL, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Failed to fetch grabs.json');
  grabs = await res.json();
  return grabs!;
}

function shotThumb(videoId: string, shotKey: string): string {
  return `${R2}/${videoId}/${shotKey}.webp`;
}

function primaryImage(item: any): string | null {
  const imgs = item?.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    return imgs[0].src || imgs[0].url || null;
  }
  return null;
}

function allImages(item: any): string[] {
  const imgs = item?.images;
  if (!Array.isArray(imgs)) return [];
  return imgs.map((i: any) => i.src || i.url).filter(Boolean);
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'search_library',
      'Search characters, locations, or grabs. Every result includes imageUrl (the primary image) when available. Use get_images for all images of an item.',
      {
        query: z.string().describe('Search term'),
        kind: z.enum(['character', 'location', 'grab', 'all']).optional().describe('Filter by kind'),
      },
      async ({ query, kind = 'all' }) => {
        const q = query.toLowerCase();
        const results: any[] = [];

        if (kind === 'character' || kind === 'location' || kind === 'all') {
          const lib = await loadLibrary();
          const libHits = lib.filter((item: any) => {
            if (kind !== 'all' && item.kind !== kind) return false;
            const searchable = [
              item.name, item.subtitle, item.id,
              item.facets?.group, item.details?.['Ethnicity detail'],
              ...(item.tags || []),
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(q);
          }).slice(0, 20);
          results.push(...libHits.map((i: any) => ({
            id: i.id,
            kind: i.kind,
            name: i.name,
            subtitle: i.subtitle,
            imageUrl: primaryImage(i),
          })));
        }

        if (kind === 'grab' || kind === 'all') {
          const { videos, shots } = await loadGrabs();
          const videoHits = videos.filter((v: any) => {
            const searchable = [
              v.title, v.artist, v.song, v.genre, v.theme, v.concept,
              ...(v.moods || []), ...(v.collections || []),
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(q);
          }).slice(0, 8);

          for (const v of videoHits) {
            results.push({
              id: v.id,
              kind: 'grab',
              name: v.title,
              subtitle: `${v.artist} · ${v.genre || ''} · ${v.shots} shots`,
              imageUrl: null,
              url: v.url,
            });
          }

          const shotHits = shots.filter((s: any) => {
            const searchable = [
              s.f, s.m, s.a, s.st, s.lk,
              ...(s.ls || []), ...(s.g || []), ...(s.mo || []),
              ...(s.cnotes || []), ...(s.cn || []),
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(q);
          }).slice(0, 12);

          for (const s of shotHits) {
            const vid = videos[s.v];
            if (!vid) continue;
            results.push({
              id: s.k,
              kind: 'grab',
              name: `${s.f || 'shot'} · ${vid.artist}`,
              subtitle: vid.title,
              imageUrl: shotThumb(vid.id, s.k),
              videoId: vid.id,
            });
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.slice(0, 30), null, 2),
          }],
        };
      }
    );

    server.tool(
      'get_images',
      'Get all image URLs for an item. Use this whenever you need pictures. Accepts character ID (CH-097), location ID (LOC-011), YouTube video ID, or shot key. Returns a simple list of URLs.',
      { id: z.string().describe('Item ID: CH-xxx, LOC-xxx, YouTube video ID, or shot key') },
      async ({ id }) => {
        const lib = await loadLibrary();
        const item = lib.find((i: any) => i.id === id);
        if (item) {
          const urls = allImages(item);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: item.id,
                name: item.name,
                kind: item.kind,
                imageUrl: urls[0] || null,
                images: urls,
              }, null, 2),
            }],
          };
        }

        const { videos, shots } = await loadGrabs();
        const video = videos.find((v: any) => v.id === id);
        if (video) {
          const vIndex = videos.indexOf(video);
          const videoShots = shots.filter((s: any) => s.v === vIndex).slice(0, 12);
          const urls = videoShots.map((s: any) => shotThumb(video.id, s.k));
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: video.id,
                name: video.title,
                kind: 'grab',
                imageUrl: urls[0] || null,
                images: urls,
              }, null, 2),
            }],
          };
        }

        const shot = shots.find((s: any) => s.k === id);
        if (shot) {
          const vid = videos[shot.v];
          const url = vid ? shotThumb(vid.id, shot.k) : null;
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: shot.k,
                name: vid?.title || shot.k,
                kind: 'grab',
                imageUrl: url,
                images: url ? [url] : [],
              }, null, 2),
            }],
          };
        }

        return { content: [{ type: 'text', text: 'Not found' }] };
      }
    );

    server.tool(
      'get_by_id',
      'Get full details by ID. Includes images array and imageUrl. Accepts CH-097, LOC-011, YouTube video ID, or shot key.',
      { id: z.string().describe('Item ID') },
      async ({ id }) => {
        const lib = await loadLibrary();
        const item = lib.find((i: any) => i.id === id);
        if (item) {
          const urls = allImages(item);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ...item,
                imageUrl: urls[0] || null,
                imageUrls: urls,
              }, null, 2),
            }],
          };
        }

        const { videos, shots } = await loadGrabs();
        const video = videos.find((v: any) => v.id === id);
        if (video) return { content: [{ type: 'text', text: JSON.stringify(video, null, 2) }] };

        const shot = shots.find((s: any) => s.k === id);
        if (shot) {
          const vid = videos[shot.v];
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ...shot,
                videoId: vid?.id,
                videoTitle: vid?.title,
                artist: vid?.artist,
                imageUrl: vid ? shotThumb(vid.id, shot.k) : null,
              }, null, 2),
            }],
          };
        }

        return { content: [{ type: 'text', text: 'Not found' }] };
      }
    );

    server.tool(
      'list_characters',
      'List characters with their primary imageUrl. Optional heritage filter.',
      { heritage: z.string().optional().describe('Optional heritage filter') },
      async ({ heritage }) => {
        const lib = await loadLibrary();
        let chars = lib.filter((i: any) => i.kind === 'character');
        if (heritage) {
          const h = heritage.toLowerCase();
          chars = chars.filter((i: any) =>
            (i.facets?.group || '').toLowerCase().includes(h) ||
            (i.details?.['Ethnicity detail'] || '').toLowerCase().includes(h)
          );
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(chars.map((i: any) => ({
              id: i.id,
              name: i.name,
              subtitle: i.subtitle,
              imageUrl: primaryImage(i),
            })), null, 2),
          }],
        };
      }
    );

    server.tool(
      'search_videos',
      'Search music videos by title, artist, genre, mood, theme.',
      {
        query: z.string().describe('Search term'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20)'),
      },
      async ({ query, limit = 20 }) => {
        const { videos } = await loadGrabs();
        const q = query.toLowerCase();
        const results = videos.filter((v: any) => {
          const searchable = [
            v.title, v.artist, v.song, v.genre, v.theme, v.concept,
            v.fingerprint, v.notes, ...(v.moods || []), ...(v.collections || []),
          ].filter(Boolean).join(' ').toLowerCase();
          return searchable.includes(q);
        }).slice(0, limit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.map((v: any) => ({
              id: v.id, title: v.title, artist: v.artist, song: v.song,
              genre: v.genre, year: v.year, bpm: v.bpm, key: v.key,
              moods: v.moods, theme: v.theme, shots: v.shots, url: v.url,
            })), null, 2),
          }],
        };
      }
    );

    server.tool(
      'get_video',
      'Get full details of a music video by YouTube ID',
      { id: z.string().describe('YouTube video ID') },
      async ({ id }) => {
        const { videos } = await loadGrabs();
        const video = videos.find((v: any) => v.id === id);
        if (!video) return { content: [{ type: 'text', text: 'Video not found' }] };
        return { content: [{ type: 'text', text: JSON.stringify(video, null, 2) }] };
      }
    );

    server.tool(
      'search_shots',
      'Search grabs/shots. Every result includes imageUrl (the thumbnail).',
      {
        query: z.string().describe('Search term (CU, LS, low-key, moody, push-in, etc.)'),
        videoId: z.string().optional().describe('Optional video ID to limit to'),
        limit: z.number().int().min(1).max(30).optional().describe('Max results (default 15)'),
      },
      async ({ query, videoId, limit = 15 }) => {
        const { shots, videos } = await loadGrabs();
        const q = query.toLowerCase();
        let filtered = shots;
        if (videoId) {
          const vIndex = videos.findIndex((v: any) => v.id === videoId);
          if (vIndex >= 0) filtered = shots.filter((s: any) => s.v === vIndex);
        }
        const results = filtered.filter((s: any) => {
          const searchable = [
            s.f, s.m, s.a, s.st, s.lk,
            ...(s.ls || []), ...(s.g || []), ...(s.mo || []),
            ...(s.cnotes || []), ...(s.cn || []),
          ].filter(Boolean).join(' ').toLowerCase();
          return searchable.includes(q);
        }).slice(0, limit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.map((s: any) => {
              const vid = videos[s.v];
              return {
                id: s.k,
                videoId: vid?.id,
                videoTitle: vid?.title,
                artist: vid?.artist,
                framing: s.f,
                imageUrl: vid ? shotThumb(vid.id, s.k) : null,
              };
            }), null, 2),
          }],
        };
      }
    );

    server.tool(
      'get_shots_for_video',
      'Get shots for a video. Every shot includes imageUrl.',
      {
        videoId: z.string().describe('YouTube video ID'),
        limit: z.number().int().min(1).max(50).optional().describe('Max shots (default 30)'),
      },
      async ({ videoId, limit = 30 }) => {
        const { shots, videos } = await loadGrabs();
        const vIndex = videos.findIndex((v: any) => v.id === videoId);
        if (vIndex < 0) return { content: [{ type: 'text', text: 'Video not found' }] };
        const videoShots = shots.filter((s: any) => s.v === vIndex).slice(0, limit);
        const vid = videos[vIndex];
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              video: { id: vid.id, title: vid.title, artist: vid.artist },
              shots: videoShots.map((s: any) => ({
                id: s.k,
                framing: s.f,
                imageUrl: shotThumb(vid.id, s.k),
              })),
            }, null, 2),
          }],
        };
      }
    );
  },
  {},
  { basePath: '/api', maxDuration: 60, verboseLogs: false }
);

export { handler as GET, handler as POST, handler as DELETE };
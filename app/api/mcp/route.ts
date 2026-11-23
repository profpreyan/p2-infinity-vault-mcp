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

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'search_library',
      'Search characters, locations, or grabs/shots. Use kind=grab for music-video grabs/shots (framing, lighting, mood, artist, title).',
      {
        query: z.string().describe('Search term (name, ethnicity, framing like CU/LS, artist, mood, etc.)'),
        kind: z.enum(['character', 'location', 'grab', 'all']).optional().describe('Filter by kind. Use grab for video shots.'),
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
          }).slice(0, 30);
          results.push(...libHits.map((i: any) => ({
            id: i.id, kind: i.kind, name: i.name, subtitle: i.subtitle,
            ethnicity: i.details?.['Ethnicity detail'], group: i.facets?.group,
          })));
        }

        if (kind === 'grab' || kind === 'all') {
          const { videos, shots } = await loadGrabs();
          // Prefer video-level matches first
          const videoHits = videos.filter((v: any) => {
            const searchable = [
              v.title, v.artist, v.song, v.genre, v.theme, v.concept,
              ...(v.moods || []), ...(v.collections || []),
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(q);
          }).slice(0, 10);

          for (const v of videoHits) {
            results.push({
              id: v.id,
              kind: 'grab',
              name: v.title,
              subtitle: `${v.artist} · ${v.genre || ''} · ${v.shots} shots`,
              artist: v.artist,
              url: v.url,
            });
          }

          // Then shot-level matches
          const shotHits = shots.filter((s: any) => {
            const searchable = [
              s.f, s.m, s.a, s.st, s.lk,
              ...(s.ls || []), ...(s.g || []), ...(s.mo || []),
              ...(s.cnotes || []), ...(s.cn || []),
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(q);
          }).slice(0, 15);

          for (const s of shotHits) {
            const vid = videos[s.v];
            if (!vid) continue;
            results.push({
              id: s.k,
              kind: 'grab',
              name: `${s.f || 'shot'} · ${vid.artist}`,
              subtitle: `${vid.title} · ${s.m || ''} · ${s.lk || ''}`,
              videoId: vid.id,
              framing: s.f,
              thumb: shotThumb(vid.id, s.k),
            });
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.slice(0, 40), null, 2),
          }],
        };
      }
    );

    server.tool(
      'get_by_id',
      'Get full details by ID. Accepts CH-097 (character), LOC-011 (location), YouTube video ID, or shot key.',
      { id: z.string().describe('Item ID: CH-xxx, LOC-xxx, YouTube video ID, or shot key') },
      async ({ id }) => {
        const lib = await loadLibrary();
        const item = lib.find((i: any) => i.id === id);
        if (item) return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };

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
                thumb: vid ? shotThumb(vid.id, shot.k) : null,
              }, null, 2),
            }],
          };
        }

        return { content: [{ type: 'text', text: 'Not found' }] };
      }
    );

    server.tool(
      'list_characters',
      'List characters, optionally filtered by heritage/group',
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
              id: i.id, name: i.name, subtitle: i.subtitle,
              ethnicity: i.details?.['Ethnicity detail'],
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
      'Search individual grabs/shots by framing, lighting, mood, camera move.',
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
                shotKey: s.k,
                videoId: vid?.id,
                videoTitle: vid?.title,
                artist: vid?.artist,
                framing: s.f,
                camera: s.m,
                angle: s.a,
                setting: s.st,
                lighting: s.lk,
                moods: s.mo,
                time: s.t,
                thumb: vid ? shotThumb(vid.id, s.k) : null,
              };
            }), null, 2),
          }],
        };
      }
    );

    server.tool(
      'get_shots_for_video',
      'Get shots/grabs for a specific video',
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
              video: { id: vid.id, title: vid.title, artist: vid.artist, totalShots: vid.shots },
              shots: videoShots.map((s: any) => ({
                key: s.k, framing: s.f, camera: s.m, angle: s.a,
                setting: s.st, lighting: s.lk, moods: s.mo, time: s.t, duration: s.d,
                thumb: shotThumb(vid.id, s.k),
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
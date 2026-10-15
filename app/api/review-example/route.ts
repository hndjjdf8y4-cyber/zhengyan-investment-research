import example from '@/lib/review-example.json';
import { attachVerifiedOriginals } from '@/lib/evidence';
import type { Research } from '@/lib/types';

// A local review aid while the model provider is unavailable. Never served by
// the production build and never used as an API-error fallback.
export async function GET(req: Request) {
  const host = new URL(req.url).hostname;
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    return new Response('Not found', {status:404});
  }
  const data=structuredClone(example);const study=data.study as Research;
  attachVerifiedOriginals(study);study.rootId=study.id;study.version=1;
  return Response.json({data}, {headers:{'Cache-Control':'no-store'}});
}

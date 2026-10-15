import { json, db, runtime } from '@/lib/server';
export async function GET(req: Request) {
  const cookie=req.headers.get('cookie')?.match(/(?:^|;\s*)zl_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token=cookie||[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const e=runtime(); let database=false;try{await db().prepare('SELECT 1 FROM studies LIMIT 1').first();database=true;}catch{}
  return json({data:{fuyao:!!e.FUYAO_API_KEY,ifind:!!e.IFIND_MCP_KEY,model:!!e.DEEPSEEK_API_KEY,database,modelName:e.DEEPSEEK_MODEL||'deepseek-flash'}},200,{'Set-Cookie':`zl_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(req.url).protocol==='https:'?'; Secure':''}`});
}

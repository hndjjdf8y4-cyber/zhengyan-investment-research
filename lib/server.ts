import { env } from 'cloudflare:workers';
import type { Research } from './types';
export const runtime = () => env as unknown as Record<string, any>;
export const db = () => { const d = runtime().DB; if (!d) throw new Error('研究数据库尚未配置，请联系维护者'); return d; };
export async function hash(s: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(v => v.toString(16).padStart(2, '0')).join(''); }
export function json(data: unknown, status = 200, extra: Record<string,string> = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extra } }); }
export async function owner(req: Request) { const token = req.headers.get('cookie')?.match(/(?:^|;\s*)zl_session=([a-f0-9]{64})(?:;|$)/)?.[1]; if (!token) throw new Error('请刷新页面以建立研究会话'); return hash(token); }
export function originGuard(req: Request) { const origin = req.headers.get('origin'); if (origin && origin !== new URL(req.url).origin) throw new Error('不允许跨站写入'); }
export async function saveStudy(who: string, study: Research) {
  await db().prepare('INSERT INTO studies(id,owner,title,payload,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,payload=excluded.payload,updated_at=excluded.updated_at WHERE studies.owner=excluded.owner').bind(study.id,who,study.plan.revisedThesis,JSON.stringify(study),study.createdAt,study.updatedAt).run();
}
export async function getStudy(who: string, id: string): Promise<Research | null> { const r = await db().prepare('SELECT payload FROM studies WHERE id=? AND owner=?').bind(id,who).first(); return r ? JSON.parse(r.payload) : null; }
export async function nextVersion(who:string,rootId:string):Promise<number>{
 const key=`version:${who}:${rootId}`;
 const r=await db().prepare("INSERT INTO budgets(id,used) VALUES(?,COALESCE((SELECT MAX(COALESCE(json_extract(payload,'$.version'),1))+1 FROM studies WHERE owner=? AND COALESCE(json_extract(payload,'$.rootId'),id)=?),1)) ON CONFLICT(id) DO UPDATE SET used=used+1 RETURNING used").bind(key,who,rootId).first();
 return Number(r.used);
}
export async function fetchJSON(url: string, init: RequestInit = {}, timeout = 25000, service='数据服务'):Promise<any> {
  const r = await fetch(url,{ ...init,signal:AbortSignal.timeout(timeout) });
  if (!r.ok) { const message = r.status === 401 ? `${service}凭证失效` : r.status === 402 ? `${service}账户余额不足` : r.status === 429 ? `${service}限流，请稍后重试；输入和已保存的研究会保留。` : `${service}请求失败（HTTP ${r.status}）`; console.warn('[upstream-error]',JSON.stringify({service,status:r.status}));throw new Error(message); }
  try { return await r.json(); } catch { throw new Error(`${service}返回非JSON内容（HTTP ${r.status}）`); }
}
export async function model(messages: { role:string; content:string }[], maxTokens = 2200) {
  const e = runtime(); if (!e.DEEPSEEK_API_KEY) throw new Error('模型服务尚未配置');
  const b = await fetchJSON('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${e.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:e.DEEPSEEK_MODEL || 'deepseek-flash',thinking:{type:'disabled'},messages,temperature:0.15,max_tokens:maxTokens,response_format:{type:'json_object'}})},70000,'DeepSeek模型服务');
  console.info('[model-usage]',JSON.stringify({model:b.model,finishReason:b.choices?.[0]?.finish_reason,usage:b.usage}));
  if(b.choices?.[0]?.finish_reason==='length')throw new Error('模型输出未完整生成，请缩小研究范围后重试');
  let text = b.choices?.[0]?.message?.content; if (typeof text !== 'string') throw new Error('模型没有返回有效内容');
  text = text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  try { return JSON.parse(text); } catch { throw new Error('模型返回格式错误，请重试'); }
}
export async function fuyao(path: string, params: Record<string,string|number>) {
  const key = runtime().FUYAO_API_KEY; if (!key) throw new Error('扶摇凭证尚未配置');
  const b = await fetchJSON('https://fuyao.aicubes.cn'+path+'?'+new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)])),{headers:{'X-api-key':key}},25000,'扶摇数据服务');
  if (b.code!==0) throw new Error(`扶摇 ${b.code}：${String(b.message||'请求失败').slice(0,180)}`); return b;
}
export async function ifind(server: 'stock'|'news'|'edb',tool: string,args: Record<string,unknown>) {
  const token=runtime().IFIND_MCP_KEY; if(!token)throw new Error('iFinD凭证尚未配置');
  const url=`https://api-mcp.51ifind.com:8643/ds-mcp-servers/hexin-ifind-ds-${server}-mcp`;
  const headers: Record<string,string>={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:token};
  async function post(body: unknown) {
    const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(r.status===429?'iFinD数据服务限流，请稍后重试。':`iFinD请求失败（HTTP ${r.status}）`);
    const session=r.headers.get('Mcp-Session-Id'); if(session)headers['Mcp-Session-Id']=session;
    const t=await r.text(); if(!t.trim())return {};
    if(t.trim().startsWith('data:') || t.includes('\ndata:')) { const line=t.split('\n').filter(l=>l.startsWith('data:')).at(-1); return JSON.parse(line?.slice(5)||'{}'); }
    return JSON.parse(t);
  }
  await post({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'thesis-lab',version:'1.0'}}});
  await post({jsonrpc:'2.0',method:'notifications/initialized'});
  const b=await post({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:tool,arguments:args}});
  if(b.error || b.result?.isError)throw new Error('iFinD工具调用失败');
  const text=b.result?.content?.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');
  if(!text)throw new Error('iFinD没有返回内容');
  let parsed; try{parsed=JSON.parse(text);}catch{throw new Error('iFinD返回格式无法解析');}
  if(parsed.code!==1)throw new Error(String(parsed.msg||'iFinD业务失败').slice(0,150));
  const data=parsed.data;
  let answer=typeof data==='string'?data:data?.answer || data?.data || '';
  if(typeof answer!=='string')answer=JSON.stringify(answer);
  return {data,answer:answer.replace(/\\n/g,'\n').replace(/\\t/g,'\t'),raw:parsed};
}
export function errorText(e: unknown) { if(e && typeof e==='object' && 'issues' in e && Array.isArray(e.issues))return e.issues.slice(0,3).map((i:any)=>/[\u4e00-\u9fff]/.test(String(i.message))?String(i.message):i.path?.[0]==='answers'?'研究条件数量或长度超出限制，请简化补充条件后重试。':i.code==='too_big'?'填写内容超过长度或数量限制，请简化后重试。':'研究条件格式不完整，请重新确认相关选项。').join('；'); if(e instanceof Error && /timeout|abort/i.test(e.name+' '+e.message))return '数据服务响应超时；已取得的证据仍然保留，可稍后刷新'; return e instanceof Error ? e.message.slice(0,240) : '请求失败，请稍后重试'; }

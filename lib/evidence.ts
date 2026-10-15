import type { Evidence, Plan, Research, Source } from './types';

export function mergeConditions(previous:{question:string;answer:string}[],next:{question:string;answer:string}[]){
 const merged=new Map<string,{question:string;answer:string}>();
 for(const answer of [...previous,...next]){const key=answer.question.replace(/[\s，。？！?：:；;、]/g,'');merged.set(key,{question:answer.question.trim(),answer:answer.answer.trim()});}
 return [...merged.values()];
}

export const MOUTAI_2024_PDF='https://www.moutai.com.cn/mtgf/articleFileDir/2025-04/08/f1d5484ad59943f580d9b1edb6aa1475.pdf';
export function sourceLink(source:Source):string|undefined{
 if(!source.url)return;
 try{const u=new URL(source.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return;if(source.page&&Number.isInteger(source.page)&&source.page>0)u.hash=`page=${source.page}`;return u.toString();}catch{return;}
}
export function sourceName(source:Source){return source.title||`${source.provider}${source.period?' · '+source.period:''}${source.url?'':' · 结构化数据/核验说明'}`;}
// Reject clear topic mismatches even when a model returns valid reference IDs.
export function relevantToQuestion(evidence:Evidence,question:Plan['questions'][number]){
 const text=question.question+' '+question.metric;
 const title=evidence.title;
 const rules:[RegExp,RegExp][]=[
  [/经营现金流/,/现金|收现|回款|营运资本|利润质量/],
  [/应收账款/,/应收|回款|营运资本|收款|利润质量/],
  [/营业收入是否/,/营收|收入|规模|主营|归因|贡献/],
  [/归母净利润是否/,/利润|盈利|主营|归因|贡献/],
  [/扣非利润/,/扣非|经常|利润|盈利|归因|贡献/],
  [/毛利率|净利率/,/毛利|净利|利润率|盈利能力|盈利|主营|归因|贡献/],
  [/销售费用率|管理费用率/,/费用|成本|利润率|主营|归因|贡献/],
  [/股价回落/,/股价|涨跌|下跌|回落|价格|错杀/],
  [/估值回落|历史估值/,/估值|市盈率|PE|错杀/],
  [/精确增量归因/,/主营|归因|贡献|量价|销量|结构|非经常/],
 ];
 const rule=rules.find(([pattern])=>pattern.test(title));return !rule||rule[1].test(text);
}
/** Fixed original index: reconcile only known values, never invent a PDF URL. */
export function attachVerifiedOriginals(study:Research){
 if(study.plan.code!=='600519.SH'||study.plan.year!==2024||study.plan.financialPeriod==='latest')return;
 const verified:Record<string,{value:number;pattern:RegExp}>={
  '营业收入':{value:170899152276.34,pattern:/营业收入/},
  '归母净利润':{value:86228146421.62,pattern:/归母净利润是否/},
  '扣非归母净利润':{value:86240905977.42,pattern:/扣非利润/},
  '经营现金流':{value:92463692168.43,pattern:/经营现金流/},
 };
 for(const e of study.evidence){
   if(e.source.url===MOUTAI_2024_PDF){e.source.title='贵州茅台2024年年度报告';e.source.kind='original';continue;}
   const match=Object.entries(verified).find(([label,v])=>v.pattern.test(e.title)&&study.metrics.some(m=>m.label===label&&m.current!==null&&Math.abs(m.current-v.value)<20000));
   if(match){e.source={...e.source,url:MOUTAI_2024_PDF,title:'贵州茅台2024年年度报告',page:5,kind:'original',originalVerifiedAt:'2026-10-14',limitation:[e.source.limitation,'已匹配此前核验的原文数值索引；本次未重新下载PDF。比较值和同比仍应核对年报表格。'].filter(Boolean).join(' ')};}
   const income=(study.raw?.income as {data?:{item?:Record<string,unknown>[]}})?.data?.item?.find(x=>x.fiscal_year===2024);
   if(/毛利率/.test(e.title)&&income&&Math.abs(Number(income.operating_income)-170899152276.34)<1&&Math.abs(Number(income.operating_costs)-13789482367.98)<1){e.source={...e.source,url:MOUTAI_2024_PDF,title:'贵州茅台2024年年度报告',page:8,kind:'original',originalVerifiedAt:'2026-10-14',limitation:'毛利率为按营业收入和营业成本计算的结果，不是年报直接引语。数据已匹配固定原文索引，本次未重新下载PDF。'};}
   const fee=/销售费用率/.test(e.title)?{field:'sales_fee',value:5639300059.49}: /管理费用率/.test(e.title)?{field:'manage_fee',value:9315650060.38}:null;
   if(fee&&income&&Math.abs(Number(income[fee.field])-fee.value)<1&&Math.abs(Number(income.operating_income)-170899152276.34)<1){e.source={...e.source,url:MOUTAI_2024_PDF,title:'贵州茅台2024年年度报告',page:8,kind:'original',originalVerifiedAt:'2026-10-15',limitation:'费用率由年报第8页对应费用和营业收入计算；链接指向原始科目，不将计算值当作原文引语。本次页面沿用已核验原文索引。'};}
 }
}
export type TaskSummary={id:string;title:string;created_at:string;updated_at:string;rootId?:string;version?:number;parentId?:string;company?:string;status?:string;verdict?:string};
export function groupTasks(tasks:TaskSummary[]){
 const groups=new Map<string,TaskSummary[]>();
 for(const t of tasks){const root=t.rootId||t.id;const list=groups.get(root)||[];list.push(t);groups.set(root,list);}
 return [...groups.entries()].map(([rootId,versions])=>({rootId,versions:versions.sort((a,b)=>(b.version||1)-(a.version||1)||b.updated_at.localeCompare(a.updated_at))})).sort((a,b)=>b.versions[0].updated_at.localeCompare(a.versions[0].updated_at));
}

import { fuyao, ifind, model, errorText, hash } from './server';
import type { Evidence, Plan, Research, Source } from './types';
import { attachVerifiedOriginals, relevantToQuestion } from './evidence';
import { analysisPrompt, reviewPrompt, grossProfitBridge, validAnalysisBlocks, verifiedForAnalysis } from './research-analysis';
import { cachedCompany, rememberCompany, unsupportedMarket, unsupportedMarketMessage } from './company-registry';
const now = () => new Date().toISOString();
const fmt = (n: number) => new Intl.NumberFormat('zh-CN', {maximumFractionDigits:2}).format(n);
const pct = (a: number,b: number) => b===0 ? null : (a-b)/Math.abs(b)*100;
const num = (v: unknown): number | null => typeof v==='number' && Number.isFinite(v) ? v : null;
export function parseMagnitude(v: string): number | null { const s=v.replace(/,/g,'').trim(); if(!/^-?\d+(?:\.\d+)?(?:亿|万)?$/.test(s))return null; const n=parseFloat(s); return n*(s.endsWith('亿')?1e8:s.endsWith('万')?1e4:1); }
export function parseTable(text: string) { return text.split(/\n|\\n/).filter(x=>x.trim().startsWith('|')).map(x=>x.trim().split('|').slice(1,-1).map(v=>v.trim())).filter(x=>!x.every(v=>/^[-: ]+$/.test(v))); }
export function tableValue(answer: string,code: string,date: string,keyword: string) { const t=parseTable(answer); const column=t[0]?.findIndex(x=>x.includes(keyword)) ?? -1; const row=t.slice(1).find(r=>r.includes(code)&&r.includes(date)); return column>=0 && row ? parseMagnitude(row[column]||'') : null; }
export async function resolveCompany(query: string) {
  const market=unsupportedMarket(query);if(market)throw new Error(unsupportedMarketMessage(query,market));
  const cached=cachedCompany(query);if(cached)return cached;
  const b=await fuyao('/api/meta/tickers/search',{q:query,'asset_type':'a-share',limit:8});
  const matches=b.data?.item?.filter((x:any)=>x.asset_type==='a-share') || [];
  const exact=matches.find((x:any)=>x.thscode===query.toUpperCase()||x.ticker===query||x.name===query);
  if(!exact && matches.length!==1)throw new Error(matches.length?'公司名称有歧义，请输入完整股票代码或公司简称':'没有找到这家A股公司，请检查名称或代码');
  const result=exact||matches[0];rememberCompany(result);return result;
}
export async function runResearch(plan: Plan, material?: {text:string;title:string;url:string;page:string}, previousId?: string): Promise<Research> {
  const company=await resolveCompany(plan.company); plan={...plan,code:company.thscode,name:company.name};
  const study: Research & { raw?:Record<string,unknown>; previousVersionId?:string }={id:crypto.randomUUID(),plan,createdAt:now(),updatedAt:now(),status:'complete',evidence:[],metrics:[],sources:[],history:[],conclusion:{verdict:'证据不足',summary:'',confidence:'有限',points:[],changes:[],conflicts:[],limitations:[],aiStatus:'等待分析'},raw:{},previousVersionId:previousId};
  const add=(stance:Evidence['stance'],title:string,finding:string,source:Source,extra:Partial<Evidence>={})=>{study.evidence.push({id:`E${study.evidence.length+1}`,stance,title,finding,source,...extra});};
  const source=(provider:string,endpoint:string,period?:string):Source=>({provider,endpoint,fetchedAt:now(),period,kind:provider==='研究边界'?'gap':'structured'});
  async function collect<T>(id:string,label:string,fn:()=>Promise<T>):Promise<T|null>{const start=Date.now();try{const result=await fn();study.raw![id]=result;study.sources.push({id,label,status:'success',detail:'已获取；按证据口径使用',elapsedMs:Date.now()-start});return result;}catch(e){study.sources.push({id,label,status:'error',detail:errorText(e),elapsedMs:Date.now()-start});add('unknown',label+'暂不可用',errorText(e),source('数据服务',label));study.status='partial';return null;}}
  const latest=plan.financialPeriod==='latest';
  const finParams={thscode:plan.code!,period:latest?'quarterly':'annual',limit:latest?20:10};
  const [income,cash]=await Promise.all([collect('income','利润表',()=>fuyao('/api/a-share/financials/income-statements',finParams)),collect('cash','现金流量表',()=>fuyao('/api/a-share/financials/cash-flow-statements',finParams))]);
  const balance=await collect('balance','资产负债表',()=>fuyao('/api/a-share/financials/balance-sheets',finParams));
  let fiscalPeriod='FY';
  if(latest){
    const cutoff=Date.parse(plan.valuationEnd+'T23:59:59+08:00');
    const latestRow=income?.data?.item?.filter((x:any)=>Number.isFinite(x.period_end_ms)&&x.period_end_ms<=cutoff).sort((a:any,b:any)=>b.period_end_ms-a.period_end_ms)[0];
    if(latestRow){plan={...plan,year:latestRow.fiscal_year,baseYear:latestRow.fiscal_year-1};study.plan=plan;fiscalPeriod=latestRow.fiscal_period;study.financialLabel=`${plan.year} ${fiscalPeriod} 累计 / ${plan.baseYear} 同期累计`;}
    add('unknown','历史时点可得数据限制','最新返回的财报版本不等于当时已公开版本；当前无法完整回放公告时点。不能据此声称市场在历史日期已知全部基本面。',source('研究边界','披露时点'));
  }
  const row=(b:any,year:number)=>b?.data?.item?.find((x:any)=>x.fiscal_year===year&&(!latest||x.fiscal_period===fiscalPeriod));
  const current=row(income,plan.year),base=row(income,plan.baseYear),cc=row(cash,plan.year),bc=row(cash,plan.baseYear),cb=row(balance,plan.year),bb=row(balance,plan.baseYear);
  const periodLabel=study.financialLabel||(latest?'指定窗口内累计财报尚未取得':`${plan.year}年报 / ${plan.baseYear}年报`);study.financialLabel=periodLabel;
  const primarySource={...source('扶摇','/api/a-share/financials/income-statements',periodLabel),requestId:income?.request_id,rawId:'income',limitation:'最新返回版本；report_date_ms不可当作首次披露日。合并报表营业收入与主营业务收入不同。季报为年初至报告期末累计，不是单季。'};
  const metrics=[['营业收入',current?.operating_income,base?.operating_income],['归母净利润',current?.parent_holder_net_profit,base?.parent_holder_net_profit],['经营现金流',cc?.act_cash_flow_net,bc?.act_cash_flow_net],['应收账款',cb?.accounts_receivable,bb?.accounts_receivable],['资本开支',cc?.pay_fixed_assets_etc_cash,bc?.pay_fixed_assets_etc_cash]] as const;
  for(const [label,a,b] of metrics)study.metrics.push({label,current:num(a),previous:num(b),unit:'元',change:num(a)!==null&&num(b)!==null?pct(a,b):null});
  if(current&&base&&[current.operating_income,base.operating_income,current.parent_holder_net_profit,base.parent_holder_net_profit].every(v=>num(v)!==null)){
    const rg=pct(current.operating_income,base.operating_income),pg=pct(current.parent_holder_net_profit,base.parent_holder_net_profit);
    add(rg!==null&&rg>0?'support':'oppose','营业收入是否改善',`${latest?plan.year+" "+fiscalPeriod+" 累计":plan.year+"年"}营业收入${fmt(current.operating_income/1e8)}亿元，对比${plan.baseYear}年变化${rg===null?'无法计算':fmt(rg)+'%'}。这是收入变化证据，不能单独证明利润归因。`,primarySource,{value:fmt(current.operating_income/1e8)+'亿元',comparison:rg===null?'基期为零':fmt(rg)+'%',calculation:'(本期营业收入－基期营业收入) ÷ |基期营业收入| × 100%',questionId:'Q1'});
    add(pg!==null&&pg>0?'support':'oppose','归母净利润是否改善',`${latest?plan.year+" "+fiscalPeriod+" 累计":plan.year+"年"}归母净利润${fmt(current.parent_holder_net_profit/1e8)}亿元，变化${pg===null?'无法计算':fmt(pg)+'%'}。`,primarySource,{value:fmt(current.parent_holder_net_profit/1e8)+'亿元',comparison:pg===null?'基期为零':fmt(pg)+'%',questionId:'Q1'});
    if(current.operating_income>0&&base.operating_income>0&&num(current.operating_costs)!==null&&num(base.operating_costs)!==null){const gm=(1-current.operating_costs/current.operating_income)*100,bgm=(1-base.operating_costs/base.operating_income)*100;study.metrics.push({label:'毛利率',current:gm,previous:bgm,unit:'%',change:gm-bgm});add(gm>=bgm?'support':'oppose','毛利率变化约束',`按营业收入和营业成本计算，本期毛利率${fmt(gm)}%，基期${fmt(bgm)}%，变化${fmt(gm-bgm)}个百分点。下降只反对“毛利率提升驱动”这一子命题，不能单独推翻整体命题。`,primarySource,{calculation:'毛利率 = (营业收入－营业成本) ÷ 营业收入 × 100%',questionId:'Q2'});}
    for(const [label,field] of [['销售费用率','sales_fee'],['管理费用率','manage_fee']] as const){
      if(current.operating_income>0&&base.operating_income>0&&num(current[field])!==null&&num(base[field])!==null){const a=current[field]/current.operating_income*100,b=base[field]/base.operating_income*100;study.metrics.push({label,current:a,previous:b,unit:'%',change:a-b});add(a<=b?'support':'oppose',label+'变化',`本期${label}${fmt(a)}%，对比期${fmt(b)}%，变化${fmt(a-b)}个百分点。${a<=b?'费用率下降有助于利润率':'费用率上升对利润率形成拖累'}，不能替代完整利润归因。`,primarySource,{calculation:`${label} = 对应费用 ÷ 营业收入 × 100%`});}
    }
    if(current.operating_income>0&&base.operating_income>0&&num(current.net_profit)!==null&&num(base.net_profit)!==null){const a=current.net_profit/current.operating_income*100,b=base.net_profit/base.operating_income*100;study.metrics.push({label:'净利率',current:a,previous:b,unit:'%',change:a-b});add(a>=b?'support':'oppose','净利率变化',`按合并净利润与营业收入计算，本期净利率${fmt(a)}%，对比期${fmt(b)}%，变化${fmt(a-b)}个百分点。`,primarySource,{calculation:'合并净利率 = 合并净利润 ÷ 营业收入 × 100%，不是归母净利润率。'});}
  }else add('unknown','缺少可比财年','所选财年未完整返回，不能用邻近报告期替代。',primarySource);
  if(cc&&bc&&num(cc.act_cash_flow_net)!==null&&num(bc.act_cash_flow_net)!==null){const cg=pct(cc.act_cash_flow_net,bc.act_cash_flow_net);add(cg!==null&&cg>=0?'support':'oppose','经营现金流交叉检查',`经营现金流为${fmt(cc.act_cash_flow_net/1e8)}亿元，相比基期${cg===null?'无法计算':fmt(cg)+'%'}。现金流是利润质量的旁证，需考虑营运资本变化。`,{...source('扶摇','/api/a-share/financials/cash-flow-statements',periodLabel),rawId:'cash',requestId:cash?.request_id},{questionId:'Q3'});}
  if(cb&&bb&&current&&base&&base.operating_income>0&&bb.accounts_receivable>0){const ar=pct(cb.accounts_receivable,bb.accounts_receivable)!,rg=pct(current.operating_income,base.operating_income)!;add(ar>rg?'oppose':'context','应收账款与收入的变化',`应收账款变化${fmt(ar)}%，营收变化${fmt(rg)}%。${ar>rg?'本期应收增速高于营收，提示需要核对收款质量':'本期应收未快于收入增长，该项没有显示应收扩张压力'}；仍需结合预收款、结算及现金收款，不能直接认定收入真实或不真实。`,{...source('扶摇','/api/a-share/financials/balance-sheets',String(plan.year)),rawId:'balance'},{questionId:'Q3'});}
  if(cc&&bc&&num(cc.pay_fixed_assets_etc_cash)!==null&&num(bc.pay_fixed_assets_etc_cash)!==null){const cg=pct(cc.pay_fixed_assets_etc_cash,bc.pay_fixed_assets_etc_cash);add('context','资本开支与经营现金流覆盖',`购建固定资产、无形资产和其他长期资产支付的现金，本期${fmt(cc.pay_fixed_assets_etc_cash/1e8)}亿元、基期${fmt(bc.pay_fixed_assets_etc_cash/1e8)}亿元，变化${cg===null?'基期为零，增速不适用':fmt(cg)+'%'}。该科目反映现金投入，不等同于所有投资支出；投入增加本身不能证明盈利改善。`,{...source('扶摇','/api/a-share/financials/cash-flow-statements',periodLabel),rawId:'cash',requestId:cash?.request_id});}
  const deducted: Record<string,number|null>={[plan.year]:null,[plan.baseYear]:null};
  const periodEnd=current?.period_end_ms?new Date(current.period_end_ms+8*3600000).toISOString().slice(5,10):'12-31';
  for(const year of (!latest||current?[plan.year,plan.baseYear]:[])){
    const reportDate=`${year}-${periodEnd}`;
    const r=await collect('deducted'+year,year+'扣非利润',()=>ifind('stock','get_stock_financials',{query:`仅查询${plan.name}${plan.code}，报告期${reportDate}${latest?'累计':'年报'}合并口径，扣除非经常性损益后的归属母公司股东净利润。只返回这一报告期这一个指标。`}));
    deducted[year]=r?tableValue(r.answer,plan.code!,reportDate.replace(/-/g,''),'扣除非经常'):null;
  }
  if(deducted[plan.year]!==null&&deducted[plan.baseYear]!==null){const d=deducted[plan.year]!,b=deducted[plan.baseYear]!,g=pct(d,b);add(g!==null&&g>0?'support':'oppose','扣非利润是否同步改善',`扣非归母净利润约${fmt(d/1e8)}亿元，变化约${g===null?'无法计算':fmt(g)+'%'}。数值来自缩写表格，存在舍入；扣非利润不等同于主营利润。`,{...source('iFinD','get_stock_financials',periodLabel),rawId:'deducted'+plan.year,limitation:'按返回单元格的亿/万量级归一；不得声称精确到元。'},{questionId:'Q2'});study.metrics.push({label:'扣非归母净利润',current:d,previous:b,unit:'元',change:g});}else add('unknown','扣非利润不可比','接口未返回匹配证券代码和指定报告期的数值，未用其他期次补齐。',source('iFinD','get_stock_financials'));
  if(current&&base){
    const bridge=grossProfitBridge(current,base);
    if(bridge)add('context','毛利增量的规模与毛利率分解',`毛利总额变化${fmt(bridge.grossProfitChange/1e8)}亿元；按基期毛利率衡量的收入规模项${fmt(bridge.scaleEffect/1e8)}亿元；按本期收入衡量的毛利率项${fmt(bridge.marginEffect/1e8)}亿元，两项之和等于毛利增量。这是会计恒等分解，不区分销量、价格和产品结构，也不等于归母净利润的主营贡献。`,primarySource,{calculation:'Δ毛利=(本期收入−基期收入)×基期毛利率+本期收入×(本期毛利率−基期毛利率)'});
    if(deducted[plan.year]!==null&&deducted[plan.baseYear]!==null&&num(current.parent_holder_net_profit)!==null&&num(base.parent_holder_net_profit)!==null){
      const total=current.parent_holder_net_profit-base.parent_holder_net_profit,deductedChange=deducted[plan.year]!-deducted[plan.baseYear]!,residualChange=total-deductedChange;
      add('support','扣非与非经常净影响的利润增量核对',`归母净利润增量${fmt(total/1e8)}亿元，扣非归母净利润增量约${fmt(deductedChange/1e8)}亿元，两者差额约${fmt(residualChange/1e8)}亿元。差额仅是归母减扣非净影响的变动，含税及归属口径；不等于非经常项目明细，更不能将扣非利润等同主营利润。`,{...source('iFinD / 扶摇','get_stock_financials',periodLabel),kind:'structured',rawId:'deducted'+plan.year,limitation:'归母来自扶摇、扣非来自iFinD；后者为缩写金额，差额为近似值，不能对很小的差额作强判断。'},{calculation:'Δ归母 = Δ扣非 + Δ(归母−扣非)'});
    }
  }
  // A bounded supplementary collection answers a concrete unresolved question.
  const cashFocus=/现金|回款|收现|利润质量/.test(plan.revisedThesis+' '+(plan.focus||[]).join(' '));
  if((cashFocus||plan.kind==='earnings')&&current&&base){
    const metric=cashFocus?'销售商品、提供劳务收到的现金':'主营业务收入';
    const header=cashFocus?'销售商品':'主营业务收入';
    const values=await Promise.all([plan.year,plan.baseYear].map(async year=>{const date=`${year}-${periodEnd}`;const r=await collect('supplement'+year,`${year}${metric}补充取证`,()=>ifind('stock','get_stock_financials',{query:`仅查询${plan.name}${plan.code}，报告期${date}${latest?'年初至期末累计':'年度'}合并口径的${metric}，只返回该期这一个指标、证券代码和报告期；若无此指标明确返回缺失，不用营业收入或其他指标替代。`}));return r?tableValue(r.answer,plan.code!,date.replace(/-/g,''),header):null;}));
    if(values.every(v=>v!==null)&&current.operating_income>0&&base.operating_income>0){
      const a=values[0]!,b=values[1]!,ratio=a/current.operating_income*100,oldRatio=b/base.operating_income*100;
      study.metrics.push({label:metric,current:a,previous:b,unit:'元',change:pct(a,b)});
      add('support',metric+'的补充交叉检查',`${metric}本期约${fmt(a/1e8)}亿元、基期约${fmt(b/1e8)}亿元；与营业收入的比值分别约${fmt(ratio)}%、${fmt(oldRatio)}%。${cashFocus?'现金收款含税款、预收款及结算时差，不能直接当作收入回款率或真实性证明。':'该字段可补充收入结构，但不能据此完成主营利润归因。'}`,{...source('iFinD','get_stock_financials',periodLabel),rawId:'supplement'+plan.year,limitation:'补充字段按缩写表格归一；两期均匹配证券代码和期末日期。不能将两家接口当作独立公司披露。'});
    }else add('unknown',metric+'补充取证未完成','补充请求未同时取得两期匹配的指定字段，保留缺口，没有以相关指标替代。',source('研究边界','补充取证',periodLabel));
  }
  if(plan.kind==='valuation'){
    const prices=await collect('prices','区间股价',()=>fuyao('/api/a-share/prices/historical',{thscode:plan.code!,interval:'1d',start:Date.parse(plan.valuationStart+'T00:00:00+08:00'),end:Date.parse(plan.valuationEnd+'T23:59:59+08:00'),adjust:'forward'}));
    const points=(prices?.data?.item||[]).filter((x:any)=>Number.isFinite(x.date_ms)&&num(x.close_price)!==null).sort((a:any,b:any)=>a.date_ms-b.date_ms).map((x:any)=>({date:new Date(x.date_ms+8*3600000).toISOString().slice(0,10),value:x.close_price}));
    if(points.length>=2){
      const priceSource={...source('扶摇','/api/a-share/prices/historical',`${points[0].date} / ${points.at(-1)!.date}`),rawId:'prices',requestId:prices?.request_id,limitation:'前复权收盘价；区间端点使用实际返回的首末交易日。'};
      study.chart={label:'区间股价',unit:'元',points,source:priceSource,limitation:'股价和经营指标的同时变化不构成因果证明。'};
      const g=pct(points.at(-1)!.value,points[0].value)!;add(g<0?'support':'oppose','股价回落是否发生',`实际区间${points[0].date}至${points.at(-1)!.date}，前复权收盘价变化${fmt(g)}%。`,priceSource,{value:`${fmt(g)}%`});
    }else add('unknown','区间股价不可比','未取得至少两个指定区间内的交易日价格，未用当前快照替代。',source('扶摇','/api/a-share/prices/historical'));
    if(/估值|市盈率|PE|错杀/i.test(plan.thesis+' '+plan.revisedThesis)){
    const pe:Record<string,number|null>={};
    for(const date of [plan.valuationStart,plan.valuationEnd]){const r=await collect('pe'+date,date+'历史PE',()=>ifind('stock','get_stock_financials',{query:`仅查询${plan.name}${plan.code}在交易日${date}的市盈率(PE,TTM)，TTM基准日按报表公告日期。只返回该日一个数值，不要区间或其他指标。`}));pe[date]=r?tableValue(r.answer,plan.code!,date.replace(/-/g,''),'市盈率'):null;}
    const a=pe[plan.valuationStart],b=pe[plan.valuationEnd];
    if(a!==null&&b!==null&&a>0&&b>0){add(b<a?'support':'oppose','估值回落是否发生',`PE(TTM)由${plan.valuationStart}的${fmt(a)}倍变为${plan.valuationEnd}的${fmt(b)}倍，变化${fmt(pct(b,a)!)}%。估值下降本身不能证明基本面未恶化。`,source('iFinD','get_stock_financials',plan.valuationStart+' / '+plan.valuationEnd),{questionId:'Q1'});study.metrics.push({label:'PE（TTM）',current:b,previous:a,unit:'倍',change:pct(b,a)});}else add('unknown','历史估值缺口','未取得两个指定交易日的有效正PE；不能用当前估值代替历史值，亏损状态PE也不宜直接比较。',source('iFinD','get_stock_financials'));
    }
  }
  const noticeStart=plan.kind==='valuation'?plan.valuationStart:`${plan.year+Number(!latest)}-01-01`,noticeEnd=plan.kind==='valuation'?plan.valuationEnd:`${plan.year+Number(!latest)}-12-31`;
  const notice=await collect('notice','公告材料',()=>ifind('news','search_notice',{query:`${plan.name} ${plan.revisedThesis} ${plan.focus?.join(' ')||''} 财报 变动原因 风险`,time_start:noticeStart,time_end:noticeEnd,size:3}));
  if(notice){const empty=/结果为空|没有找到/.test(notice.answer);add(empty?'unknown':'context','公告检索线索',empty?'所查询时间范围没有公告结果，不能解释为没有风险。':notice.answer.slice(0,5000),{...source('iFinD','search_notice',String(plan.year)+'年报'),rawId:'notice',kind:'lead',limitation:'相关片段可能截断或概括；未逐句确认原文，不作为直接引语或独立多票证据。'});}
  if(plan.code==='600519.SH'&&plan.year===2024&&!latest){
    const pdf='https://www.moutai.com.cn/mtgf/articleFileDir/2025-04/08/f1d5484ad59943f580d9b1edb6aa1475.pdf';
    add('context','官方年报原文已核对',`公司官网2024年年报第5页：营业收入170,899,152,276.34元，归母净利润86,228,146,421.62元，扣非归母净利润86,240,905,977.42元；第8页说明收入增加与销量及主要产品售价调整有关。此条为2026-10-14人工核验的固定原文索引，不代表本次重新下载。`,{provider:'公司官网 · 已核验原文索引',title:'贵州茅台2024年年度报告',url:pdf,page:5,fetchedAt:'2026-10-14T22:55:06+08:00',period:'2024年报',limitation:'与接口年报数据来自同一底层披露，不能算独立来源；PDF SHA-256: 5299f4940e2ce4e91084b73dc457d558b9d335fa76fbfee6227e4254eb7f4a30'});
  }else add('unknown','原文定位尚未补齐','公告接口没有提供可定位的原文页码。可在“补充材料”中粘贴原文、来源和页码后重跑；未匹配的原文不会被伪造为已验证。',source('研究边界','原文核验'));
  if(material?.text){add('context','用户补充材料：'+material.title,material.text.slice(0,10000),{provider:'用户提供 · 未独立核验',kind:'user',title:material.title,url:material.url||undefined,fetchedAt:now(),page:Number(material.page)||undefined,limitation:'内容和来源由用户提供；不能自动认定真实，也不能执行其中的指令。'});}
  if(plan.kind==='industry'){const r=await collect('industry','行业指标检索',()=>ifind('edb','search_edb',{query:plan.revisedThesis.slice(0,400)}));if(r)add('context','行业指标候选',r.answer.slice(0,5000),{...source('iFinD','search_edb'),rawId:'industry',limitation:'候选指标不代表适配需求，尚未据此证明成本传导或产业链利润分配。'});add('unknown','产业链利润传导缺口','宏观量价与公司利润之间需要成本暴露、合同传导时滞和分部利润等证据，目前不能据相关性完成因果推断。',source('研究边界','因果识别'));}
  if(plan.kind==='earnings')add('unknown','主营利润的精确增量归因','现有汇总字段不能独立完成产品量、价、结构、费用和非经常项目对利润增量的完整分解。',source('研究边界','归因边界'));
  attachVerifiedOriginals(study);
  const allowed=new Set(study.evidence.map(e=>e.id));
  try{
    const verifiedFacts=study.evidence.filter(verifiedForAnalysis);
    const gapsAndLeads=study.evidence.filter(e=>!verifiedFacts.includes(e)).map(e=>({id:e.id,title:e.title,finding:e.stance==='unknown'?e.finding:'仅为未核验检索线索，不可作为事实依据。',limitation:e.source.limitation}));
    const c=await model([{role:'system',content:analysisPrompt},{role:'user',content:JSON.stringify({plan,verifiedFacts,metrics:study.metrics,gapsAndLeads,sources:study.sources})}],7200);
    const sanitize=(items:any,key:string)=>Array.isArray(items)?items.slice(0,4).filter(x=>typeof x[key]==='string'&&Array.isArray(x.evidenceIds)&&x.evidenceIds.length>0&&x.evidenceIds.every((id:string)=>allowed.has(id))).map(x=>({...x,evidenceIds:x.evidenceIds.filter((id:string)=>allowed.has(id))})):[];
    const verifiedIds=new Set(verifiedFacts.map(e=>e.id));
    const points=sanitize(c.points,'text').filter((p:any)=>p.evidenceIds.every((id:string)=>verifiedIds.has(id)));if(!points.length)throw new Error('模型引用无法校验');
    const questionIds=new Set(plan.questions.map(q=>q.id));
    for(const evidence of study.evidence){delete evidence.questionId;evidence.questionIds=[];}
    const assessments=Array.isArray(c.evidenceAssessments)?c.evidenceAssessments:[];
    for(const a of assessments){const evidence=study.evidence.find(e=>e.id===a.id);if(evidence&&verifiedIds.has(a.id)&&evidence.stance!=='unknown'&&['support','oppose','context'].includes(a.stance)){evidence.stance=a.stance;evidence.questionIds=(Array.isArray(a.questionIds)?a.questionIds:[]).filter((id:string)=>questionIds.has(id)&&relevantToQuestion(evidence,plan.questions.find(q=>q.id===id)!));}}
    study.questionAnswers=plan.questions.map(q=>{const a=Array.isArray(c.questionAnswers)?c.questionAnswers.find((x:any)=>x.questionId===q.id):null;const ids=Array.isArray(a?.evidenceIds)?a.evidenceIds.filter((id:string)=>allowed.has(id)&&relevantToQuestion(study.evidence.find(e=>e.id===id)!,q)):[];if(!a||!ids.length)return {questionId:q.id,state:'unknown' as const,answer:'未形成可追溯的完整回答，保留为待验证问题。',evidenceIds:[]};return {questionId:q.id,state:a.state==='answered'&&/主要|归因|贡献|因果|销量|量价|出货|预期|资金面/.test(q.question)?'partial':['answered','partial','unknown'].includes(a.state)?a.state:'unknown',answer:String(a.answer||'').slice(0,1800),observation:String(a.observation||'').slice(0,1200),interpretation:String(a.interpretation||'').slice(0,1600),alternativeExplanation:String(a.alternativeExplanation||'').slice(0,1200),missingEvidence:String(a.missingEvidence||'').slice(0,800),evidenceIds:ids};});
    for(const answer of study.questionAnswers||[]){for(const id of answer.evidenceIds){const evidence=study.evidence.find(e=>e.id===id);if(evidence&&!evidence.questionIds?.includes(answer.questionId))evidence.questionIds=[...(evidence.questionIds||[]),answer.questionId];}}
    study.conclusion={verdict:['支持','部分支持','不支持','证据不足'].includes(c.verdict)?c.verdict:'证据不足',summary:String(c.summary||'').slice(0,1800),confidence:['充分','有限','不足'].includes(c.confidence)?c.confidence:'有限',points,changes:sanitize(c.changes,'condition'),conflicts:sanitize(c.conflicts,'description'),limitations:(Array.isArray(c.limitations)?c.limitations:[]).slice(0,8).map(String),aiStatus:'DeepSeek 分析 · 引用ID已校验'};
    study.analysisBlocks=validAnalysisBlocks(c.analysisBlocks,study,verifiedIds);
    try{
      const reviewed=await model([{role:'system',content:reviewPrompt},{role:'user',content:JSON.stringify({plan,facts:verifiedFacts,metrics:study.metrics,gaps:gapsAndLeads,draft:{conclusion:study.conclusion,analysisBlocks:study.analysisBlocks,questionAnswers:study.questionAnswers}})}],3000);
      if(!Array.isArray(reviewed.issues)||typeof reviewed.revisedSummary!=='string'||!['支持','部分支持','不支持','证据不足'].includes(reviewed.revisedVerdict))throw new Error('复核输出格式不完整');
      if(reviewed.issues.some((x:any)=>typeof x.problem!=='string'||typeof x.resolution!=='string'||!Array.isArray(x.evidenceIds)||x.evidenceIds.some((id:string)=>!allowed.has(id))))throw new Error('复核引用未通过校验');
      // Review may tighten, but cannot upgrade a partially supported draft to full support.
      if(reviewed.revisedVerdict!=='支持'||study.conclusion.verdict==='支持'){
        study.conclusion.verdict=reviewed.revisedVerdict;study.conclusion.summary=reviewed.revisedSummary.slice(0,1800);
      }
      study.review={status:'complete',issues:reviewed.issues.slice(0,5)};
      if(Array.isArray(reviewed.rejectedBlockIndexes))study.analysisBlocks=study.analysisBlocks.filter((_,i)=>!reviewed.rejectedBlockIndexes.includes(i));
      if(Array.isArray(reviewed.rejectedQuestionIds))study.questionAnswers=study.questionAnswers.map(a=>reviewed.rejectedQuestionIds.includes(a.questionId)?{questionId:a.questionId,state:'unknown',answer:'本项解释在复核中未能成立，仍需补充可核验材料。',evidenceIds:[]}:a);
      const rejected=new Set<string>(reviewed.issues.flatMap((x:any)=>x.evidenceIds));
      study.conclusion.points=study.conclusion.points.filter(point=>!point.evidenceIds.some(id=>rejected.has(id)));
      // Review notes are model opinions, not new source facts; retain separately.
      study.conclusion.aiStatus='DeepSeek 分析与独立调用复核 · 引用ID已校验';
    }catch(e){study.review={status:'unavailable',issues:[],detail:errorText(e)};study.conclusion.limitations.push('补充复核未完成：'+errorText(e));study.conclusion.aiStatus='DeepSeek 分析完成 · 补充复核未完成';}
  }catch(e){study.status='partial';for(const evidence of study.evidence){delete evidence.questionId;if(evidence.stance==='support'||evidence.stance==='oppose')evidence.stance='context';}study.questionAnswers=plan.questions.map(q=>({questionId:q.id,state:'unknown',answer:'模型未完成判断，已取得的数据仍可查看。',evidenceIds:[]}));study.conclusion={verdict:'证据待复核',summary:'数据证据已保留，但AI结论未完成。请查看下方证据与来源，稍后重试。',confidence:'不足',points:[],changes:[],conflicts:[],limitations:[errorText(e)],aiStatus:'模型分析失败，未生成替代性结论'};}
  if(plan.kind==='earnings'&&/主要|主营|归因|贡献/.test(plan.revisedThesis)&&study.conclusion.verdict==='支持'&&study.evidence.some(e=>e.title==='主营利润的精确增量归因'))study.conclusion.verdict='部分支持';
  const usable=study.evidence.filter(e=>e.stance==='support'||e.stance==='oppose');if(!usable.length)study.conclusion.verdict='证据不足';
  study.updatedAt=now(); return study;
}

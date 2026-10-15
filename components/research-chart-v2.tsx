'use client';
import { Bar, BarChart, Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Research } from '@/lib/types';

export function ResearchChart({study,variant='all'}:{study:Research;variant?:'all'|'financial'|'price'}){
 const ratios=!!study.plan.focus?.length&&study.plan.focus.every(f=>/毛利率|净利率|费用率|盈利能力|利润率/.test(f));
 const preferred=ratios?study.metrics.filter(m=>m.unit==='%'):study.metrics.filter(m=>['营业收入','归母净利润','经营现金流'].includes(m.label));
 const selected=(preferred.length?preferred:study.metrics.filter(m=>m.unit==='元')).filter(m=>m.current!==null&&m.previous!==null).slice(0,3);
 const isRatio=selected[0]?.unit==='%';
 const data=selected.map(m=>({label:m.label,current:m.current!/(m.unit==='元'?1e8:1),previous:m.previous!/(m.unit==='元'?1e8:1)}));
 const label=(n:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n);
 const tooltipStyle={background:'var(--wb-paper)',border:'1px solid var(--wb-line)',borderRadius:4,fontSize:12,color:'var(--wb-ink)'};
 const showFinancial=variant!=='price'&&data.length>0;
 const showPrice=variant!=='financial'&&study.chart;
 if(!showPrice&&!showFinancial)return null;
 return <section className={'wb-charts '+(variant==='financial'?'wb-charts-compact':'')} aria-label="研究数据图表">
  {showPrice&&study.chart&&<div className="wb-chart-block"><div className="wb-section-title"><h2>{study.chart.label}</h2><span>{study.chart.source.period} · {study.chart.unit} · 前复权</span></div><div role="img" aria-label={`${study.chart.label}折线图。${study.chart.points[0]?.date}至${study.chart.points.at(-1)?.date}，共${study.chart.points.length}个交易日。`}><ResponsiveContainer width="100%" height={235}><LineChart data={study.chart.points} margin={{left:0,right:18,top:12,bottom:5}}><CartesianGrid vertical={false} stroke="var(--wb-line)"/><XAxis dataKey="date" minTickGap={65} tick={{fontSize:11,fill:'var(--wb-muted)'}} tickFormatter={s=>s.slice(5)}/><YAxis domain={['auto','auto']} width={62} tick={{fontSize:11,fill:'var(--wb-muted)'}} tickFormatter={label}/><Tooltip contentStyle={tooltipStyle} formatter={(value:any)=>[label(Number(value))+' 元','收盘价']}/><Line dataKey="value" name="收盘价" stroke="var(--wb-accent)" strokeWidth={2} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div><p className="wb-chart-note">{study.chart.source.provider} · 前复权收盘价；首末日期为实际交易日。</p></div>}
  {showFinancial&&<div className="wb-chart-block"><div className="wb-section-title"><h2>{isRatio?'盈利能力对比':'财务变化'}</h2><span>{isRatio?'%':'亿元'}</span></div><div role="img" aria-label={data.map(m=>`${m.label}：本期${label(m.current)}，对比期${label(m.previous)}`).join('；')}><ResponsiveContainer width="100%" height={205}><BarChart data={data} barGap={4} margin={{left:0,right:4,top:8,bottom:0}}><CartesianGrid vertical={false} stroke="var(--wb-line)"/><XAxis dataKey="label" tick={{fontSize:11,fill:'var(--wb-muted)'}} axisLine={false} tickLine={false}/><YAxis width={47} tick={{fontSize:10,fill:'var(--wb-muted)'}} tickFormatter={label} axisLine={false} tickLine={false}/><Tooltip contentStyle={tooltipStyle} formatter={(v:any)=>label(Number(v))+(isRatio?'%':' 亿元')}/><Legend wrapperStyle={{fontSize:11,paddingTop:8}}/><Bar dataKey="previous" name={study.plan.baseYear+(study.plan.financialPeriod==='latest'?' 同期':'')} fill="var(--wb-chart-base)" maxBarSize={38} isAnimationActive={false}/><Bar dataKey="current" name={study.plan.year+(study.plan.financialPeriod==='latest'?' 累计':'')} fill="var(--wb-accent)" maxBarSize={38} isAnimationActive={false}/></BarChart></ResponsiveContainer></div><p className="wb-chart-note">扶摇 · {study.financialLabel||'年报合并口径'}</p></div>}
 </section>;
}

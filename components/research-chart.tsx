'use client';
import { Bar, BarChart, Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Research } from '@/lib/types';

export function ResearchChart({study}:{study:Research}){
 const ratios=!!study.plan.focus?.length&&study.plan.focus.every(f=>/毛利率|净利率|费用率|盈利能力|利润率/.test(f));
 const preferred=ratios?study.metrics.filter(m=>m.unit==='%'):study.metrics.filter(m=>['营业收入','归母净利润','经营现金流'].includes(m.label));
 const selected=(preferred.length?preferred:study.metrics.filter(m=>m.unit==='元')).filter(m=>m.current!==null&&m.previous!==null).slice(0,3);
 const isRatio=selected[0]?.unit==='%';
 const data=selected.map(m=>({label:m.label,current:m.current!/(m.unit==='元'?1e8:1),previous:m.previous!/(m.unit==='元'?1e8:1)}));
 const label=(n:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n);
 if(!study.chart&&!data.length)return null;
 return <section className="wb-charts" aria-label="研究数据图表">
  {study.chart&&<div className="wb-chart-block"><div className="wb-section-title"><h2>{study.chart.label}</h2><span>{study.chart.source.period} · {study.chart.unit} · 前复权</span></div><div role="img" aria-label={`${study.chart.label}折线图。${study.chart.points[0]?.date}至${study.chart.points.at(-1)?.date}，共${study.chart.points.length}个交易日。`}><ResponsiveContainer width="100%" height={235}><LineChart data={study.chart.points} margin={{left:0,right:18,top:12,bottom:5}}><CartesianGrid vertical={false} stroke="#e6ebe5"/><XAxis dataKey="date" minTickGap={65} tick={{fontSize:11}} tickFormatter={s=>s.slice(5)}/><YAxis domain={['auto','auto']} width={62} tick={{fontSize:11}} tickFormatter={label}/><Tooltip formatter={(value:any)=>[label(Number(value))+' 元','收盘价']}/><Line dataKey="value" name="收盘价" stroke="#357559" strokeWidth={2} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div><p className="wb-chart-note">来源：{study.chart.source.provider}。{study.chart.source.limitation}</p></div>}
  {!!data.length&&<div className="wb-chart-block"><div className="wb-section-title"><h2>{isRatio?'盈利能力对比':'财务变化对比'}</h2><span>{isRatio?'单位：%':'单位：亿元'} · {study.financialLabel||'年报合并口径'}</span></div><div role="img" aria-label={data.map(m=>`${m.label}：本期${label(m.current)}，对比期${label(m.previous)}`).join('；')}><ResponsiveContainer width="100%" height={230}><BarChart data={data} barGap={6} margin={{left:0,right:12,top:10,bottom:0}}><CartesianGrid vertical={false} stroke="#e6ebe5"/><XAxis dataKey="label" tick={{fontSize:12}} axisLine={false} tickLine={false}/><YAxis width={62} tick={{fontSize:11}} tickFormatter={label} axisLine={false} tickLine={false}/><Tooltip formatter={(v:any)=>label(Number(v))+(isRatio?'%':' 亿元')}/><Legend wrapperStyle={{fontSize:12,paddingTop:10}}/><Bar dataKey="previous" name={`${study.plan.baseYear} 对比期`} fill="#c2d1c4" radius={[3,3,0,0]} maxBarSize={46} isAnimationActive={false}/><Bar dataKey="current" name={`${study.plan.year} 本期`} fill="#357559" radius={[3,3,0,0]} maxBarSize={46} isAnimationActive={false}/></BarChart></ResponsiveContainer></div><p className="wb-chart-note">来源：扶摇财务报表；季度数据为同季度累计口径。图中数值来自本次保存的快照，不是模型生成。</p></div>}
 </section>;
}

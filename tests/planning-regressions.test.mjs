import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConditions } from '../lib/evidence.ts';
import { cachedCompany, unsupportedMarket, unsupportedMarketMessage, rememberCompany } from '../lib/company-registry.ts';

test('retrying clarification replaces answers instead of accumulating duplicates',()=>{
 const initial=Array.from({length:12},(_,i)=>({question:`研究条件${i}？`,answer:'初始值'}));
 const repeated=initial.slice(0,4).map(x=>({...x,answer:'修改后'}));
 const merged=mergeConditions(initial,repeated);assert.equal(merged.length,12);assert.equal(merged[0].answer,'修改后');
 assert.equal(mergeConditions([{question:'关注方向？',answer:'收入'}],[{question:'关注方向?',answer:'现金流'}]).length,1);
});
test('verified company metadata can be used while upstream directory is throttled',()=>{
 assert.equal(cachedCompany('贵州茅台').thscode,'600519.SH');assert.equal(cachedCompany('300750.sz').name,'宁德时代');
 rememberCompany({name:'测试公司',thscode:'000001.SZ',ticker:'000001'});assert.equal(cachedCompany('000001').name,'测试公司');
});
test('Meituan is identified as an unsupported market rather than a nonexistent A share',()=>{
 assert.equal(unsupportedMarket('美团-W'),'港股');assert.equal(unsupportedMarket('03690.HK'),'港股');assert.equal(unsupportedMarket('贵州茅台'),undefined);
 assert.match(unsupportedMarketMessage('美团','港股'),/尚未接通港股/);assert.doesNotMatch(unsupportedMarketMessage('美团','港股'),/没有找到/);
});

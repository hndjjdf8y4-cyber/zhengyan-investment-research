import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLink, groupTasks, attachVerifiedOriginals, MOUTAI_2024_PDF, relevantToQuestion } from '../lib/evidence.ts';

test('citation links reject executable protocols and embedded credentials',()=>{
  assert.equal(sourceLink({url:'javascript:alert(1)'}),undefined);
  assert.equal(sourceLink({url:'https://token@example.com/report.pdf'}),undefined);
  assert.equal(sourceLink({url:'https://example.com/report.pdf',page:8}),'https://example.com/report.pdf#page=8');
  assert.equal(sourceLink({url:'https://example.com/report.pdf',page:-1}),'https://example.com/report.pdf');
});
test('original PDF links require matching known financial values and period',()=>{
  const create=(value,year=2024)=>({plan:{code:'600519.SH',year,financialPeriod:'annual'},metrics:[{label:'营业收入',current:value}],evidence:[{title:'营业收入是否改善',source:{provider:'扶摇'}}]});
  const matching=create(170899152276.34);attachVerifiedOriginals(matching);
  assert.equal(matching.evidence[0].source.url,MOUTAI_2024_PDF);
  assert.equal(matching.evidence[0].source.page,5);
  const wrongValue=create(12345);attachVerifiedOriginals(wrongValue);assert.equal(wrongValue.evidence[0].source.url,undefined);
  const wrongYear=create(170899152276.34,2025);attachVerifiedOriginals(wrongYear);assert.equal(wrongYear.evidence[0].source.url,undefined);
});
test('versions group by root, retain old snapshots and show newest version first',()=>{
  const tasks=[{id:'old',rootId:'root',version:1,updated_at:'2026-10-15T01:00:00Z'},{id:'new',rootId:'root',version:2,updated_at:'2026-10-15T02:00:00Z'},{id:'unrelated',updated_at:'2026-10-14T01:00:00Z'}];
  const groups=groupTasks(tasks);assert.equal(groups.length,2);assert.deepEqual(groups[0].versions.map(t=>t.id),['new','old']);assert.equal(groups[1].rootId,'unrelated');assert.equal(tasks.length,3);
});
test('valid IDs do not allow cash flow evidence to answer a margin-only question',()=>{
 assert.equal(relevantToQuestion({title:'经营现金流交叉检查'},{question:'毛利率与成本费用率如何变化？',metric:'收入、成本、销售管理费用'}),false);
 assert.equal(relevantToQuestion({title:'经营现金流交叉检查'},{question:'经营现金流能否支持利润质量？',metric:'现金流净额'}),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { grossProfitBridge, validAnalysisBlocks, verifiedForAnalysis } from '../lib/research-analysis.ts';

test('gross profit bridge reconciles exactly and does not treat missing data as zero',()=>{
 const value=grossProfitBridge({operating_income:120,operating_costs:36},{operating_income:100,operating_costs:20});
 assert.ok(value);assert.ok(Math.abs(value.scaleEffect+value.marginEffect-value.grossProfitChange)<1e-10);
 assert.ok(value.scaleEffect>0);assert.ok(value.marginEffect<0);
 assert.equal(grossProfitBridge({operating_income:120},{operating_income:100,operating_costs:20}),null);
 assert.equal(grossProfitBridge({operating_income:120,operating_costs:0},{operating_income:0,operating_costs:0}),null);
});
test('unknown leads cannot be promoted to a supporting analysis block',()=>{
 const study={evidence:[{id:'E1'},{id:'E2'}],metrics:[{label:'营业收入'}],plan:{questions:[{id:'Q1'}]}};
 const block={title:'论证',stance:'support',observation:'事实',interpretation:'解释',counterpoint:'边界',evidenceIds:['E2'],metricLabels:['营业收入','不存在指标'],questionIds:['Q1','不存在问题']};
 assert.deepEqual(validAnalysisBlocks([block],study,new Set(['E1'])),[]);
 const unknown=validAnalysisBlocks([{...block,stance:'unknown'}],study,new Set(['E1']));
 assert.equal(unknown.length,1);assert.deepEqual(unknown[0].metricLabels,['营业收入']);assert.deepEqual(unknown[0].questionIds,['Q1']);
});
test('user material and search leads remain unverified even if a stance is supplied',()=>{
 assert.equal(verifiedForAnalysis({stance:'support',source:{kind:'lead'}}),false);
 assert.equal(verifiedForAnalysis({stance:'support',source:{kind:'user'}}),false);
 assert.equal(verifiedForAnalysis({stance:'context',source:{kind:'structured',endpoint:'/api/a-share/financials/income-statements'}}),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';

test('reporting years remain valid after a Workers epoch-time cold start',async()=>{
 const RealDate=globalThis.Date;
 try {
  globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[0]));} };
  const schemas=await import('../lib/reporting-year.ts');
  globalThis.Date=RealDate;
  const current=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric'}).format(new RealDate()));
  assert.equal(schemas.reportingYearSchema.safeParse(2024).success,true);
  assert.equal(schemas.reportingYearSchema.safeParse(current).success,true);
  assert.equal(schemas.reportingYearSchema.safeParse(current+1).success,false);
  assert.equal(schemas.comparisonYearSchema.safeParse(2016).success,true);
  assert.equal(schemas.reportingYearSchema.safeParse(2016).success,false);
 } finally { globalThis.Date=RealDate; }
});

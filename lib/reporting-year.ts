import { z } from 'zod';

// Workers may expose the Unix epoch during module initialization. Evaluate
// the current year when parsing a request, never while constructing a schema.
const notFuture=(year:number)=>year<=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric'}).format(new Date()));
export const reportingYearSchema=z.number().int().min(2017).refine(notFuture,'研究年份不能晚于当前年份');
export const comparisonYearSchema=z.number().int().min(2016).refine(notFuture,'比较年份不能晚于当前年份');

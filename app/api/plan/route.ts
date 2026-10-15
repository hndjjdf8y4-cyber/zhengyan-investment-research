import { z } from 'zod';
import { json, owner, originGuard, errorText } from '@/lib/server';
import { planResearch } from '@/lib/planning';
export async function POST(req: Request) {try {originGuard(req);await owner(req);const b=z.object({thesis:z.string().trim().min(8,'请补充具体命题').max(1600),answers:z.array(z.object({question:z.string().max(240),answer:z.string().trim().min(1).max(1500,'补充条件过长，请简化后重试。')})).max(32,'研究条件过多，请修改原命题后重新开始。').default([])}).parse(await req.json());return json({data:await planResearch(b.thesis,b.answers)});}catch(e){return json({error:errorText(e)},400);}}

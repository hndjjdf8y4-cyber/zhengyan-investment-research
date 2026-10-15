export type Stance = 'support' | 'oppose' | 'unknown' | 'context';
export type Clarification = {id:string;question:string;options:string[];allowCustom:boolean;selection?:'single'|'multiple'};
export type ClarificationAnswer = {question:string;answer:string};
export type PlanningResult = {phase:'clarify';thesis:string;questions:Clarification[]} | {phase:'ready';plan:Plan};
export type Plan = {
  thesis: string; revisedThesis: string; kind: 'earnings' | 'valuation' | 'industry';
  company: string; code?: string; name?: string; year: number; baseYear: number;
  valuationStart: string; valuationEnd: string;
  definition: string; questions: { id: string; question: string; metric: string }[];
  clarifications: string[]; aiStatus?: string;
  financialPeriod?: 'annual' | 'latest';
  focus?: string[]; confirmedConditions?: ClarificationAnswer[];
};
export type Source = { provider: string; endpoint?: string; requestId?: string; title?: string; url?: string; page?: number; fetchedAt: string; period?: string; limitation?: string; rawId?: string; kind?:'original'|'structured'|'lead'|'user'|'gap';originalVerifiedAt?:string };
export type Evidence = { id: string; stance: Stance; title: string; finding: string; value?: string; comparison?: string; calculation?: string; source: Source; questionId?: string; questionIds?: string[] };
export type QuestionAnswer = {questionId:string;state:'answered'|'partial'|'unknown';answer:string;evidenceIds:string[];observation?:string;interpretation?:string;alternativeExplanation?:string;missingEvidence?:string};
export type AnalysisBlock = {title:string;stance:'support'|'oppose'|'unknown';observation:string;interpretation:string;counterpoint:string;evidenceIds:string[];metricLabels:string[];questionIds:string[]};
export type ChartSeries = {label:string;unit:string;points:{date:string;value:number}[];source:Source;limitation?:string};
export type Research = {
  id: string; plan: Plan; createdAt: string; updatedAt: string; status: string;
  rootId?:string;parentId?:string;version?:number;raw?:Record<string,unknown>;
  questionAnswers?:QuestionAnswer[];chart?:ChartSeries;financialLabel?:string;analysisBlocks?:AnalysisBlock[];
  review?:{status:'complete'|'unavailable';issues:{problem:string;resolution:string;evidenceIds:string[]}[];detail?:string};
  evidence: Evidence[]; conclusion: { verdict: string; summary: string; confidence: string; points: { text: string; evidenceIds: string[] }[]; changes: { condition: string; effect: string; evidenceIds: string[] }[]; conflicts: { description: string; resolution: string; evidenceIds: string[] }[]; limitations: string[]; aiStatus: string };
  sources: { id: string; label: string; status: string; detail: string; elapsedMs?: number }[];
  metrics: { label: string; current: number | null; previous: number | null; unit: string; change: number | null }[];
  history: { role: 'user' | 'assistant'; content: string; evidenceIds?: string[]; at: string }[];
};

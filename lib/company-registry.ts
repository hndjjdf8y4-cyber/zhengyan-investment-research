export type CompanyIdentity={thscode:string;name:string;ticker?:string;asset_type?:string};
// These two identities were verified against the live company directory.
const verified:CompanyIdentity[]=[{thscode:'600519.SH',ticker:'600519',name:'贵州茅台',asset_type:'a-share'},{thscode:'300750.SZ',ticker:'300750',name:'宁德时代',asset_type:'a-share'}];
const normalized=(q:string)=>q.trim().replace(/\s+/g,'').toUpperCase();
const identities=new Map<string,{company:CompanyIdentity;expires:number}>();
for(const company of verified)for(const key of [company.thscode,company.ticker!,company.name])identities.set(normalized(key),{company,expires:Infinity});
export function cachedCompany(query:string){const row=identities.get(normalized(query));return row&&row.expires>Date.now()?row.company:undefined;}
export function rememberCompany(company:CompanyIdentity){for(const key of [company.thscode,company.ticker,company.name].filter(Boolean) as string[])identities.set(normalized(key),{company,expires:Date.now()+24*3600000});}
export function unsupportedMarket(query:string){
 const q=query.trim();
 if(/\.HK$|港股/i.test(q)||/^(美团(?:-W)?|MEITUAN|腾讯(?:控股)?|小米(?:集团)?|快手(?:-W)?|03690|00700|01810)$/i.test(q))return '港股';
 if(/\.(US|NASDAQ|NYSE)$|美股/i.test(q)||/^(苹果|APPLE|特斯拉|TESLA|英伟达|NVIDIA|AAPL|TSLA|NVDA)$/i.test(q))return '美股';
 return undefined;
}
export function unsupportedMarketMessage(company:string,market:string){return `${company}属于${market}。当前产品尚未接通${market}研究链路；iFinD具备相关市场数据能力，但本产品仍需适配。请先使用A股公司，原问题已保留。`;}

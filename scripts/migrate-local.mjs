import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Use the same local-only D1 identity as vite.config.ts. No cloud mutation.
const vite=readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8');
const id=vite.match(/SITE_CREATOR_PLACEHOLDER_DATABASE_ID\s*=\s*"([a-f0-9-]+)"/)?.[1];
if(!id)throw new Error('Cannot determine the local D1 identity from vite.config.ts');
mkdirSync('.sites-runtime',{recursive:true});
const config=path.resolve('.sites-runtime/db-migrate.json');
writeFileSync(config,JSON.stringify({name:'thesis-local-db',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:id,migrations_dir:path.resolve('drizzle')}]}));
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config',config,'--persist-to',path.resolve('.wrangler/state')],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});
if(result.error)throw result.error;
process.exitCode=result.status??1;

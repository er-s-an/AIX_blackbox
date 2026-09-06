#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {verify} from './index.ts';
const args=process.argv.slice(2),value=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const path=args[0];if(!path||path.startsWith('--')){console.error('Usage: afr-verify <packet.zip> [--offline] [--rpc URL] [--trust PATH] [--expect-set full|public] [--json]');process.exit(2);}
try{const result=await verify(readFileSync(path),{offline:args.includes('--offline'),...(value('--rpc')?{rpc:value('--rpc')!}:{}),...(value('--trust')?{trustPath:value('--trust')!}:{}),...(value('--expect-set')?{expectSet:value('--expect-set')!}:{})});
 if(args.includes('--json'))console.log(JSON.stringify(result,null,2));else{console.log('AFR independent verification — '+result.overall);for(const c of result.checks)console.log(`${c.status.padEnd(11)} ${c.id}: ${c.detail}${c.label?'\n  '+c.label:''}`);for(const w of result.warnings)console.log('Warning: '+w);if(result.superseded.packet)console.log('Superseded: a newer anchored final packet exists');for(const cap of result.caps)console.log(cap);}
 process.exitCode=result.checks.some((c:any)=>c.id==='FORMAT'&&c.status==='Fail')?2:result.overall==='failed'?1:result.overall==='incomplete'?3:0;
}catch(e:any){console.error('Packet rejected: '+String(e.message).slice(0,400));process.exitCode=2;}

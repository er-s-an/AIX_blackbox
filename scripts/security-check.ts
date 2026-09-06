import {readFileSync,writeFileSync} from 'node:fs';import {parse} from 'dotenv';
const env=parse(readFileSync('.secrets/gateway.env')),base='http://127.0.0.1:4311',results:any[]=[];
async function check(name:string,path:string,status:number,body?:any,cookie='',origin=''){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});results.push({name,expected:status,actual:r.status,pass:r.status===status});}
await check('unauthenticated case read','/cases',401);await check('wrong password','/login',401,{role:'operator',password:'incorrect'});
const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'user',password:env.USER_PASSWORD})});const cookie=login.headers.get('set-cookie')!.split(';')[0]!;
const id='0x06f91c2a95e0cd8bb3203f5f7d8b3a55';await check('user cannot approve','/cases/'+id+'/decision',403,{outcome:'Approved'},cookie);await check('user cannot pay','/cases/'+id+'/payout',403,{},cookie);await check('cross origin mutation','/cases',403,{mode:'attack',signer:'0x'+'11'.repeat(20)},cookie,'https://untrusted.invalid');
await check('user cannot invoke operator reconciliation','/cases/'+id+'/reconcile',403,{},cookie);
const service=await fetch('http://127.0.0.1:4314/payout/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});results.push({name:'unauthorized operator service',pass:service.status===401,actual:service.status});
writeFileSync('runs/security-check.json',JSON.stringify(results,null,2));console.log(results);process.exitCode=results.every(r=>r.pass)?0:1;

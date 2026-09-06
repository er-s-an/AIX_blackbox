import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {parse} from 'dotenv';import {privateKeyToAccount} from 'viem/accounts';
const env=parse(readFileSync('.secrets/gateway.env')),user=privateKeyToAccount(parse(readFileSync('.secrets/test-user.env')).TEST_USER_PK as `0x${string}`);let cookie='';
async function call(path:string,body?:unknown){const started=Date.now();const r=await fetch('http://127.0.0.1:4311'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(240000)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0]!;const data:any=await r.json();if(!r.ok)throw new Error(path+': '+data.error);console.log(JSON.stringify({step:path,status:data.status||data.claim_status||'ok',ai_status:data.ai_status,elapsed_ms:Date.now()-started,error:data.error||data.ai_error}));return data;}
await call('/login',{role:'operator',password:env.OPERATOR_PASSWORD});
let c:any;const resume=process.argv.find(a=>a.startsWith('--resume='))?.split('=')[1];
if(resume)c=await call('/cases/'+resume);else{c=await call('/cases',{mode:process.argv.includes('--normal')?'normal':'attack',signer:user.address});const signature=await user.signTypedData(c.typed_data);c=await call(`/cases/${c.id}/authorize`,{signature,signer:user.address});}
mkdirSync('runs/'+c.id,{recursive:true});writeFileSync('runs/LATEST',c.id+'\n');
if(c.status==='Authorized')c=await call(`/cases/${c.id}/purchase`,{});
if(c.status!=='Settled'){console.log('Real agent did not settle a payment. No fabricated fallback. Case '+c.id);process.exitCode=1;}else{
 if(!c.analysis||c.ai_status==='Not Available')c=await call(`/cases/${c.id}/analysis`,{});
 if(c.ai_status==='Available'&&!c.decision){
  const approved=c.analysis.primary_hypothesis.category==='Prompt Injection'&&c.analysis.recommended_next_state==='Under Review';
  // This is an explicitly labelled automated operator test under the user's test-run authorization.
  // It is not evidence that a human clicked the reviewer UI.
  c=await call(`/cases/${c.id}/decision`,{outcome:approved?'Approved':'Denied',reason:approved?'Automated operator integration test under user-authorized synthetic test-asset run; evidence indicates task deviation.':'Automated operator integration test: actual model did not identify an eligible prompt-injection case; no payout approved.',amount:c.payment.amount});
 }
 if(c.decision&&['Approved','Partially Approved','Payout Failed'].includes(c.claim_status))c=await call(`/cases/${c.id}/payout`,{});
 if(c.decision&&['Paid','Denied','Payout Failed'].includes(c.claim_status))c=await call(`/cases/${c.id}/export`,{});
 const summary={case_id:c.id,network:1439,actual_model:c.analysis?.model_run.model||null,payment_tx:c.payment_tx,auth_anchor:c.auth,payout:c.payout||null,packet:c.packet||null,verification:c.versions.at(-1)?.verification||null,ai_status:c.ai_status,operator_mode:'automated integration test, not a human UI signoff',metamask_ui:'NOT_RUN',recorded_at:new Date().toISOString()};writeFileSync(`runs/${c.id}/LIVE-RESULT.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}

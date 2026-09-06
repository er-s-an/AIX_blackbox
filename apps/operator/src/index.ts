import Fastify from 'fastify';import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {parse} from 'dotenv';import {privateKeyToAccount} from 'viem/accounts';import {parseEther,pad,encodeFunctionData,keccak256,type Hex} from 'viem';import {timingSafeEqual} from 'node:crypto';
import {sealedFiles} from '../../../packages/core/src/sealed-file.ts';
import {signObject,evidence,type Json} from '../../../packages/core/src/index.ts';import {validate} from '../../../packages/core/src/schema.ts';import {clients,ensureTestnet,gas,confirmed,vaultAbi} from '../../../packages/chain/src/index.ts';
const env=parse(readFileSync('.secrets/operator.env'));if(env.GATEWAY_PK||env.VERIFIER_PK||process.env.GATEWAY_PK||process.env.VERIFIER_PK)throw new Error('KEY_ISOLATION_VIOLATION');const account=privateKeyToAccount(env.OPERATOR_PK as Hex);const {wallet,publicClient}=clients(account);const deploy=JSON.parse(readFileSync('deployments/injective-testnet.json','utf8'));
const journal=sealedFiles(env.OPERATOR_PK!);
const app=Fastify({logger:false,bodyLimit:1024*1024});app.get('/health',async()=>({ok:true,address:account.address}));
app.addHook('preHandler',async(req,reply)=>{if(req.url==='/health')return;const a=Buffer.from(String(req.headers.authorization||'')),b=Buffer.from('Bearer '+env.SERVICE_TOKEN);if(a.length!==b.length||!timingSafeEqual(a,b))return reply.code(401).send({error:'Unauthorized'});});
app.post('/scenario',async(req)=>{const signed=await signObject(account,req.body);validate('scenario',signed);return signed;});
let busy=false;app.post('/decision',async(req,reply)=>{
 if(busy)return reply.code(409).send({error:'Operator busy'});busy=true;
 try{const d=req.body as Json;validate('decision',{...d,signature:'0x'+'00'.repeat(65)});
  if(d.decided_by_key_id!=='operator-demo-1'||d.asset_address.toLowerCase()!==deploy.contracts.AFRTestUSD.toLowerCase())return reply.code(422).send({error:'Invalid decision asset/key'});
  if((['Approved','Partially Approved'].includes(d.outcome) && (parseEther(d.payout_amount)>parseEther(d.eligible_loss.eligible)||parseEther(d.payout_amount)<=0n)) || (d.outcome==='Denied' && parseEther(d.payout_amount)!==0n))return reply.code(422).send({error:'Payout outside eligible loss'});
  mkdirSync('.runtime/operator',{recursive:true,mode:0o700});const path='.runtime/operator/'+d.claim_ref+'.json';if(existsSync(path))return reply.code(409).send({error:'Decision already recorded'});
  const decision=await signObject(account,d);journal.write(path,{decision,status:'ApprovedAwaitingBroadcast'});return {decision};
 }finally{busy=false;}
});
app.post('/payout/:claim',async(req,reply)=>{
 if(busy)return reply.code(409).send({error:'Operator busy'});busy=true;
 try{const claim=(req.params as Json).claim;if(!/^0x[0-9a-f]{32}$/.test(claim))return reply.code(400).send({error:'Invalid claim'});const path='.runtime/operator/'+claim+'.json';const record=journal.read(path);const d=record.decision;
  if(!['Approved','Partially Approved'].includes(d.outcome))return reply.code(409).send({error:'No payout approval'});await ensureTestnet(publicClient);if(record.payout)return record;
  // Persist the broadcast hash before waiting so retries reconcile the same transaction.
  let tx=record.tx;if(tx){const receipt=await publicClient.getTransactionReceipt({hash:tx}).catch(()=>null);if(receipt?.status==='reverted'){record.failed_attempts=[...(record.failed_attempts||[]),tx];delete record.tx;tx=undefined;journal.write(path,record);}}if(!tx){const nonce=await publicClient.getTransactionCount({address:account.address,blockTag:'pending'});const raw=await account.signTransaction({chainId:1439,to:deploy.contracts.ClaimVault,nonce,data:encodeFunctionData({abi:vaultAbi,functionName:'payout',args:[pad(d.claim_ref as Hex,{size:32}),d.decision_version,d.payout_to,parseEther(d.payout_amount)]}),...gas});tx=keccak256(raw);record.tx=tx;record.raw_transaction=raw;journal.write(path,record);}if(record.raw_transaction&&!(await publicClient.getTransaction({hash:tx}).catch(()=>null)))await wallet!.sendRawTransaction({serializedTransaction:record.raw_transaction});
  const r=await confirmed(publicClient,tx);const payout=await evidence(account,'payout',{tx_hash:tx,block_number:Number(r.blockNumber),from:deploy.contracts.ClaimVault.toLowerCase(),to:d.payout_to,asset:d.asset_address,amount:d.payout_amount,claim_ref:d.claim_ref,decision_version:d.decision_version},null,'operator-demo-1');record.payout=payout;record.status='Paid';journal.write(path,record);return record;
 }catch(e:any){return reply.code(503).send({error:'Payout not confirmed',code:e.shortMessage?'CHAIN_ERROR':'PAYOUT_ERROR'});}finally{busy=false;}
});
await app.listen({host:'127.0.0.1',port:4314});for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>void app.close());

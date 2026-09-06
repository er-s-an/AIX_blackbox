import {verifySnapshot} from '../../snapshot/src/index.ts';
import { readFileSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {parseEther,decodeEventLog,pad,type Hex} from 'viem';
import {unpack,strictJson,digest,hash,hasQuote,EXCLUDED,packetCommitment,mandateCommitment,refId,recoverDigest,recoverMandate,verifyObject,sameAddress,analysisOutputDigest,inputDigest,type Json} from '../../core/src/index.ts';
import {validate} from '../../core/src/schema.ts';
import {clients,ensureTestnet,anchorAbi,tokenAbi,vaultAbi} from '../../chain/src/index.ts';
export type Status='Pass'|'Fail'|'Unknown'|'Not Present';
export type Check={id:string,status:Status,critical:boolean,detail:string,label?:string};
export type Options={offline?:boolean;rpc?:string;trustPath?:string;expectSet?:string};
export const defaultTrust=fileURLToPath(new URL(existsSync(fileURLToPath(new URL('./trust/',import.meta.url)))?'./trust/trusted_signers.json':'../trust/trusted_signers.json',import.meta.url));
export async function verify(bytes:Uint8Array,options:Options={}){
 const checks:Check[]=[];const warnings:string[]=[];const superseded:any={packet:null,auth:null};
 const check=(id:string,status:Status,detail:string,critical=true,label?:string)=>{checks.push({id,status,detail,critical,...(label?{label}:{})});};
 const trustPath=options.trustPath||defaultTrust;const trust=strictJson(readFileSync(trustPath));validate('trusted_signers',trust);
 try{const probe=unpack(bytes);if(strictJson(probe['manifest.json']!).format_version==='afr-snapshot/1')return verifySnapshot(bytes,trust,options);}catch{}
 const rootResult:any={format_version:'afr-verify/1',verified_at:new Date().toISOString(),mode:options.offline?'offline':'online',trust_source:{path:trustPath,repo_url:trust.repo.url,repo_commit:trust.repo.commit,published_at:trust.published_at,overridden_by_flag:!!options.trustPath},rpc:options.offline?null:options.rpc||trust.chain.default_rpc,packet:{},checks,superseded,warnings,caps:['Integrity does not prove source truth, causality, or correctness of AI or human decisions.','Execution environment: verifier-signed statement (software; not hardware-attested)','Signer registration is operator-maintained; RPC and published trust configuration remain trust assumptions.']};
 const finish=()=>{rootResult.overall=checks.some(c=>c.status==='Fail')?'failed':checks.some(c=>c.critical&&c.status!=='Pass')?'incomplete':'all_pass_in_scope';return rootResult;};
 let files:Record<string,Uint8Array>,m:Json,mandate:Json;
 try{files=unpack(bytes);m=strictJson(files['manifest.json']!);validate('manifest',m);if(files['mandate.json']){mandate=strictJson(files['mandate.json']);validate('mandate',mandate);}else if(m.disclosure_set_id!=='public')throw new Error('MANDATE_MISSING');
   const types=m.anchors_expected.map((x:Json)=>x.type);if(new Set(types).size!==types.length||(!types.includes('AUTH')&&!['Not Eligible','Rejected for Processing'].includes(m.claim_status))||(m.packet_anchoring==='anchored'&&!types.includes('PACKET')))throw new Error('ANCHOR_SET');
   if(m.packet_version===1?m.previous_commitment!==null:m.previous_commitment===null)throw new Error('PREVIOUS_COMMITMENT');
   check('FORMAT','Pass','Schemas and safe ZIP container accepted');
 }catch(e:any){check('FORMAT','Fail',String(e.message).slice(0,400));return finish();}
 if(files['trusted_signers.json'])warnings.push('packaged trust config ignored');
 if(existsSync('trusted_signers.json'))warnings.push('cwd trust config ignored; using installation trust');
 if(trust.repo.url.startsWith('urn:'))warnings.push('Local release candidate: trust configuration has not been published.');
 if(trust.repo.dirty)warnings.push('Local unpublished working tree; source commit is a base commit, not a release attestation.');
 const entries=m.files as Json[];let integrity=true;const listed=new Set<string>();
 for(const f of entries){if(EXCLUDED.has(f.path)||listed.has(f.path)||!files[f.path]||files[f.path]!.length!==f.bytes||hash(files[f.path]!)!==f.sha256)integrity=false;listed.add(f.path);}
 for(const name of Object.keys(files))if(!EXCLUDED.has(name)&&name!=='trusted_signers.json'&&!listed.has(name))integrity=false;
 for(const required of (m.disclosure_set_id==='public'?['README.md','proofs/salt']:['mandate.json','scenario.json','decision.json','README.md','proofs/salt']))if(!listed.has(required))integrity=false;
 check('INTEGRITY',integrity?'Pass':'Fail',integrity?'All disclosed file bytes match signed inventory':'Missing, unlisted or changed file');
 const salt=files['proofs/salt']?new TextDecoder().decode(files['proofs/salt']!).trim() as Hex:'0x';let commitment:Hex;
 try{commitment=packetCommitment(m,salt);}catch{check('INTEGRITY','Fail','Invalid salt');return finish();}
 rootResult.packet={packet_id:m.packet_id,lineage_id:m.lineage_id,disclosure_set_id:m.disclosure_set_id,packet_version:m.packet_version,commitment};
 let trustStatus:Status='Pass';const trustSigner=(address:string,key:string,role:string,time:string)=>{
  const s=trust.signers.find((s:Json)=>s.key_id===key&&s.role===role);
  if(!trust.signers.some((s:Json)=>sameAddress(s.address,address))){if(trustStatus!=='Fail')trustStatus='Unknown';return;}
  if(!s||!sameAddress(address,s.address)||s.status==='revoked'){trustStatus='Fail';return;}
  const date=Date.parse(time);if(!Number.isFinite(date)||date<Date.parse(s.valid_from)||(s.valid_to&&date>Date.parse(s.valid_to))){if(trustStatus!=='Fail')trustStatus='Unknown';}
 };
 try{const sig=strictJson(files['proofs/manifest.sig.json']!);if(sig.digest!==digest(m)||sig.key_id!==m.signer_key_id)throw new Error();const who=await recoverDigest(digest(m),sig.signature);trustSigner(who,sig.key_id,'gateway',m.created_at);check('MANIFEST_SIG','Pass','Manifest digest and EIP-191 signature match');}catch{check('MANIFEST_SIG','Fail','Manifest signature/digest mismatch');}
 if(!mandate){
  check('SIGNER_TRUST',trustStatus,'Public manifest signer registration');
  check('DISCLOSURE',(options.expectSet||'full')==='public'?'Not Present':'Fail','Restricted originals withheld; cannot establish full evidence');
  for(const id of ['MANDATE_SIG','LINKAGE','EXEC_ENV','ANCHOR_AUTH','AUTH_ORDER','RECEIPT_PAYMENT','RECEIPT_PAYOUT'])check(id,'Not Present','Original source withheld from public disclosure');
  const a=m.anchors_expected.find((x:Json)=>x.type==='PACKET');
  if(options.offline)check('ANCHOR_PACKET','Unknown','Offline');
  else if(!a||!sameAddress(a.contract,trust.contracts.evidence_anchor)||a.ref_id!==refId(m.lineage_id,'public')||!trust.signers.some((s:Json)=>s.role==='gateway'&&sameAddress(s.address,a.submitter)))check('ANCHOR_PACKET','Fail','Public anchor locator invalid');
  else try{const {publicClient:p}=clients(undefined,options.rpc||trust.chain.default_rpc);await ensureTestnet(p);const record=await p.readContract({address:a.contract,abi:anchorAbi,functionName:'get',args:[a.submitter,1,a.ref_id,a.version]});const head=await p.getBlockNumber({cacheTime:0});check('ANCHOR_PACKET',record[0]===commitment&&record[1]>0n&&head-record[1]>=BigInt(trust.chain.confirmation_depth)?'Pass':'Fail','Public commitment and confirmation depth');superseded.packet=(await p.readContract({address:a.contract,abi:anchorAbi,functionName:'latest',args:[a.submitter,1,a.ref_id]}))>a.version;}catch{check('ANCHOR_PACKET','Unknown','RPC unavailable');}
  return finish();
 }
 try{const who=await recoverMandate(mandate);if(!sameAddress(who,mandate.signer)||!sameAddress(mandate.typed_data.domain.verifyingContract,trust.contracts.evidence_anchor)||!sameAddress(mandate.typed_data.message.asset_address,trust.contracts.test_token.address))throw new Error();check('MANDATE_SIG','Pass','EIP-712 user signature and configured chain/domain/asset match');}catch{check('MANDATE_SIG','Fail','User signature or signing domain mismatch');}
 const events:Json[]=[];let linked=true;
 try{
  for(const [path,raw]of Object.entries(files))if(path.startsWith('evidence/')&&path.endsWith('.json')){const e=strictJson(raw);validate('evidence',e);if(e.content_hash!==digest(e.content))throw new Error();const who=await verifyObject(e);trustSigner(who,e.key_id,e.kind==='payout'?'operator':'gateway',e.observed_at);events.push(e);}
  if(new Set(events.map(e=>e.evidence_id)).size!==events.length)throw new Error();const recorded=events.filter(e=>e.kind!=='payout');if(recorded.filter(e=>e.parent_hash===null).length!==1)throw new Error();const hashes=new Set(recorded.map(e=>digest(e)));const parents=recorded.filter(e=>e.parent_hash!==null).map(e=>e.parent_hash);if(parents.some(h=>!hashes.has(h))||new Set(parents).size!==parents.length)throw new Error();
  if(m.lineage_id!==mandate.typed_data.message.lineage_id)throw new Error();
  const scenario=strictJson(files['scenario.json']!);validate('scenario',scenario);trustSigner(await verifyObject(scenario),scenario.author_key_id,'scenario_author',m.created_at);
  if(digest(scenario.supplier_registry)!==mandate.typed_data.message.supplier_registry||scenario.policy.policy_hash!==mandate.typed_data.message.policy_hash)throw new Error();
  if(!files['policy/synthetic_policy.md']||hash(files['policy/synthetic_policy.md']!)!==mandate.typed_data.message.policy_hash)throw new Error();
 }catch{linked=false;}
 const pay=events.find(e=>e.kind==='payment')?.content,payout=events.find(e=>e.kind==='payout')?.content;
 let decision:Json,analysis:Json;
 try{if(files['decision.json']){decision=strictJson(files['decision.json']);validate('decision',decision);trustSigner(await verifyObject(decision),decision.decided_by_key_id,'operator',decision.decided_at);if(decision.claim_ref!==m.claim_ref||decision.evidence_basis.some((id:string)=>!events.some(e=>e.evidence_id===id)))throw new Error();if(files['analysis.json']&&decision.ai_analysis_digest!==digest(strictJson(files['analysis.json'])))throw new Error();}}
 catch{linked=false;}
 try{if(files['analysis.json']){analysis=strictJson(files['analysis.json']);validate('analysis',analysis);const ids=new Map(events.map(e=>[e.evidence_id,e]));const refs=[...analysis.evidence_refs,...analysis.candidate_causes.flatMap((c:Json)=>[...c.supporting_refs,...c.opposing_refs]),...analysis.contradictions.flatMap((c:Json)=>c.refs)];if(refs.some((id:string)=>!ids.has(id)))throw new Error();for(const q of analysis.quotes){const e=ids.get(q.evidence_id);if(!e||!hasQuote(e.content,q.exact_substring))throw new Error();}}}catch{linked=false;}
 check('LINKAGE',linked?'Pass':'Fail',linked?'Signed evidence, policy, scenario and object references agree':'Evidence signature, digest or reference mismatch');
 if(files['proofs/verifier_statement.json']){
  try{const s=strictJson(files['proofs/verifier_statement.json']);validate('verifier_statement',s);const who=await recoverDigest(digest(s.statement),s.signature);trustSigner(who,s.statement.key_id,'verifier',s.statement.issued_at);if(!trust.verifier_programs.some((p:Json)=>p.program_hash===s.statement.program_hash)||!analysis||analysisOutputDigest(analysis)!==s.statement.output_digest||inputDigest(analysis.model_run.input_digests)!==s.statement.input_digest||!events.some(e=>e.kind==='rule_facts'&&digest(e.content)===s.statement.rule_facts_digest)||!files['inputs/request.json']||!analysis.model_run.input_digests.includes(digest(strictJson(files['inputs/request.json']).messages)))throw new Error();check('EXEC_ENV','Pass','Registered verifier signed matching input/output digests',true,rootResult.caps[1]);}catch{check('EXEC_ENV','Fail','Verifier statement/signature/program/input/output mismatch');}
 }else check('EXEC_ENV','Not Present','No AI execution statement',!!analysis);
 check('TEE_ATTESTATION','Not Present','Hardware attestation outside P0 scope',false);
 check('SIGNER_TRUST',trustStatus,'Signer registration checked against installation trust',true,`Signer: gateway/${m.signer_key_id} (per trusted_signers.json @ ${trust.repo.commit}${trust.repo.dirty?' + unpublished changes':''})`);
 const expectedSet=options.expectSet||'full';check('DISCLOSURE',m.disclosure_set_id!==expectedSet?'Fail':m.disclosure.withheld_count>0?'Not Present':'Pass',m.disclosure_set_id===expectedSet?'Declared disclosure set '+expectedSet:'Disclosure set mismatch',true);
 const onchain=['ANCHOR_AUTH','ANCHOR_PACKET','AUTH_ORDER','RECEIPT_PAYMENT','RECEIPT_PAYOUT'];
 if(options.offline){for(const id of onchain)check(id,'Unknown','Offline: chain data not queried',id!=='RECEIPT_PAYOUT'||!!payout);return finish();}
 const {publicClient:p}=clients(undefined,options.rpc||trust.chain.default_rpc);
 try{await ensureTestnet(p);}catch{for(const id of onchain)check(id,'Unknown','RPC unavailable or wrong network');return finish();}
 let authBlock:bigint|undefined;let paymentBlock:bigint|undefined;const auth=m.anchors_expected.find((a:Json)=>a.type==='AUTH');
 for(const [type,id]of [['AUTH','ANCHOR_AUTH'],['PACKET','ANCHOR_PACKET']] as const){
  const a=m.anchors_expected.find((a:Json)=>a.type===type);if(!a&&type==='AUTH'&&['Not Eligible','Rejected for Processing'].includes(m.claim_status)){check(id,'Not Present','No authorization anchor in unprotected outcome profile',false);continue;}if(!a){check(id,type==='PACKET'&&m.packet_anchoring==='not_anchored'?'Not Present':'Fail','No declared anchor',type==='AUTH'||expectedSet==='full');continue;}
  const allowedSubmitter=trust.signers.some((s:Json)=>s.role==='gateway'&&sameAddress(s.address,a.submitter));
  if(a.chain_id!==1439||!sameAddress(a.contract,trust.contracts.evidence_anchor)||!allowedSubmitter||a.ref_id!==refId(m.lineage_id,type==='AUTH'?'full':m.disclosure_set_id)){check(id,'Fail','Anchor locator does not match configured trust and derived namespace');continue;}
  try{const [record,latest,head]=await Promise.all([p.readContract({address:a.contract,abi:anchorAbi,functionName:'get',args:[a.submitter,type==='AUTH'?0:1,a.ref_id,a.version]}),p.readContract({address:a.contract,abi:anchorAbi,functionName:'latest',args:[a.submitter,type==='AUTH'?0:1,a.ref_id]}),p.getBlockNumber({cacheTime:0})]);
   const expected=type==='AUTH'?mandateCommitment(mandate):commitment;const ok=record[0]===expected&&record[1]>0n&&head-record[1]>=BigInt(trust.chain.confirmation_depth)&&(type!=='AUTH'||(a.commitment===expected&&BigInt(a.block_number)===record[1]));
   check(id,ok?'Pass':'Fail',ok?'On-chain commitment and block depth match':'Missing/different commitment or insufficient confirmation depth');
   superseded[type==='AUTH'?'auth':'packet']=latest>a.version;if(type==='PACKET')superseded.latest_packet_version=latest;else if(ok)authBlock=record[1];
  }catch{check(id,'Unknown','RPC anchor read failed');}
 }
 for(const [data,id]of [[pay,'RECEIPT_PAYMENT'],[payout,'RECEIPT_PAYOUT']] as const){
  if(!data){const required=id==='RECEIPT_PAYMENT'?!['Not Eligible','Rejected for Processing'].includes(m.claim_status):m.claim_status==='Paid';check(id,'Not Present','No transaction in this outcome profile',required);continue;}
  try{const receipt=await p.getTransactionReceipt({hash:data.tx_hash});const tx=await p.getTransaction({hash:data.tx_hash});
   const event=receipt.logs.filter(l=>sameAddress(l.address,trust.contracts.test_token.address)).map(l=>{try{return decodeEventLog({abi:tokenAbi,eventName:'Transfer',data:l.data,topics:l.topics});}catch{return null;}}).find(e=>e&&sameAddress(e.args.from,data.from)&&sameAddress(e.args.to,data.to)&&e.args.value===parseEther(data.amount));
   let ok=receipt.status==='success'&&!!event&&sameAddress(data.asset,trust.contracts.test_token.address);
   if(id==='RECEIPT_PAYMENT'){paymentBlock=receipt.blockNumber;ok=ok&&sameAddress(tx.from,mandate.typed_data.message.agent_wallet)&&sameAddress(data.from,mandate.typed_data.message.agent_wallet)&&data.payment_ref===m.payment_ref&&data.mandate_id===mandate.typed_data.message.mandate_id&&data.agent_run_id===m.agent_run_id;}
   else{ok=ok&&!!decision&&sameAddress(data.from,trust.contracts.claim_vault)&&sameAddress(data.to,decision.payout_to)&&data.amount===decision.payout_amount&&sameAddress(decision.asset_address,data.asset);const event=receipt.logs.filter(l=>sameAddress(l.address,trust.contracts.claim_vault)).map(l=>{try{return decodeEventLog({abi:vaultAbi,eventName:'Payout',data:l.data,topics:l.topics});}catch{return null;}}).find(e=>e&&e.args.claimRef===pad(m.claim_ref,{size:32})&&e.args.decisionVersion===decision.decision_version&&sameAddress(e.args.to,decision.payout_to)&&e.args.amount===parseEther(decision.payout_amount));ok=ok&&!!event;}
   check(id,ok?'Pass':'Fail',ok?'Actual ERC-20 transfer and signed payment/decision fields match':'Receipt/transfer/decision mismatch');
  }catch{check(id,'Unknown','RPC transaction query failed');}
 }
 if(authBlock!==undefined&&paymentBlock!==undefined){let order=authBlock+BigInt(trust.chain.ordering_gap)<=paymentBlock;
  if(superseded.auth){try{const latest=await p.readContract({address:auth.contract,abi:anchorAbi,functionName:'latest',args:[auth.submitter,0,auth.ref_id]});if(latest-auth.version>100)throw new Error();for(let v=auth.version+1;v<=latest;v++){const r=await p.readContract({address:auth.contract,abi:anchorAbi,functionName:'get',args:[auth.submitter,0,auth.ref_id,v]});if(r[1]+BigInt(trust.chain.ordering_gap)<=paymentBlock)order=false;}}catch{check('AUTH_ORDER','Unknown','Effective authorization version could not be determined');return finish();}}
  check('AUTH_ORDER',order?'Pass':'Fail',order?'Signed authorization anchored before payment; effective version valid':'Late authorization or superseded authorization was used');
 }else check('AUTH_ORDER',pay?'Unknown':'Not Present','Authorization/payment block unavailable',!!pay);
 if(!files['anchors.json'])warnings.push('anchors hint missing; commitment and payment/payout receipts verified independently');
 else{try{const hint=strictJson(files['anchors.json']);const r=await p.getTransactionReceipt({hash:hint.packet.tx_hash});if(Number(r.blockNumber)!==hint.packet.block_number)warnings.push('anchor hint inconsistent');}catch{warnings.push('anchor hint receipt unavailable');}}
 return finish();
}

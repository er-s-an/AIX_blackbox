import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parse} from 'dotenv';
import {privateKeyToAccount} from 'viem/accounts';
import {parseEther,type Hex} from 'viem';
import {clients,ensureTestnet,confirmed,gas,anchorAbi,tokenAbi,vaultAbi} from '../packages/chain/src/index.ts';
import {randomHex,hash,refId,sameAddress} from '../packages/core/src/index.ts';
const env=(n:string)=>parse(readFileSync('.secrets/'+n+'.env'));
const account=(n:string,k:string)=>{const value=env(n)[k]!;return privateKeyToAccount((value.startsWith('0x')?value:'0x'+value) as Hex);};
const deployer=account('deployer','DEPLOYER_PK'),gateway=account('gateway','GATEWAY_PK'),operator=account('operator','OPERATOR_PK'),verifier=account('verifier','VERIFIER_PK');
const {wallet,publicClient}=clients(deployer);await ensureTestnet(publicClient);
mkdirSync('deployments',{recursive:true});mkdirSync('spikes/s2-anchor-rpc/evidence',{recursive:true});
const file='deployments/injective-testnet.json';const fresh=process.argv.includes('--fresh');if(fresh&&existsSync('.runtime/cases.sqlite'))throw new Error('FRESH_DEPLOY_REQUIRES_SEPARATE_WORKSPACE');if(fresh&&existsSync(file)){mkdirSync('deployments/history',{recursive:true});writeFileSync('deployments/history/'+Date.now()+'.json',readFileSync(file));}const state:any=existsSync(file)&&!fresh?JSON.parse(readFileSync(file,'utf8')):{chain_id:1439,created_at:new Date().toISOString(),deployer:deployer.address,contracts:{},transactions:[]};
const save=()=>writeFileSync(file,JSON.stringify(state,null,2)+'\n');
for(const name of ['EvidenceAnchor','AFRTestUSD','ClaimVault']){
 if(state.contracts[name]){const code=await publicClient.getCode({address:state.contracts[name]});if(!code||code==='0x')throw new Error('DEPLOYMENT_MISSING_CODE');continue;}
 const artifact=JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`,'utf8'));
 const tx=await wallet!.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args:name==='ClaimVault'?[state.contracts.AFRTestUSD,operator.address]:[],...gas,gas:3000000n});
 const receipt=await confirmed(publicClient,tx);state.contracts[name]=receipt.contractAddress;state.transactions.push({kind:'deploy',name,tx,block:Number(receipt.blockNumber),gas_used:receipt.gasUsed.toString(),gas_price:receipt.effectiveGasPrice.toString()});save();console.log(name,receipt.contractAddress,tx);
}
if(!sameAddress(await publicClient.readContract({address:state.contracts.ClaimVault,abi:vaultAbi,functionName:'operator'}),operator.address))throw new Error('DEPLOYMENT_OPERATOR_MISMATCH_USE_FRESH_WORKSPACE');
for(const who of [gateway,operator]){
 if(await publicClient.getBalance({address:who.address})<parseEther('0.005')){const tx=await wallet!.sendTransaction({to:who.address,value:parseEther('0.02'),...gas,gas:21000n});await confirmed(publicClient,tx);state.transactions.push({kind:'fund-test-gas',address:who.address,tx});save();}
}
for(const to of [gateway.address,state.contracts.ClaimVault]){
 if(await publicClient.readContract({address:state.contracts.AFRTestUSD,abi:tokenAbi,functionName:'balanceOf',args:[to]})<parseEther('100')){const tx=await wallet!.writeContract({address:state.contracts.AFRTestUSD,abi:tokenAbi,functionName:'mint',args:[to,parseEther('1000')],...gas});await confirmed(publicClient,tx);state.transactions.push({kind:'mint-test-token',to,tx});save();}
}
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const trust={format_version:'afr-trust/1',published_at:new Date().toISOString(),repo:{url:'urn:afr:local-worktree',commit,dirty:true,working_tree_digest:hash(readFileSync('docs/predev/09-实施修订与验收边界.md'))},chain:{chain_id:1439,name:'Injective EVM Testnet',default_rpc:'https://testnet.evm.archival.chain.virtual.json-rpc.injective.network/',fallback_rpcs:['https://k8s.testnet.json-rpc.injective.network/'],confirmation_depth:1,ordering_gap:1},contracts:{evidence_anchor:state.contracts.EvidenceAnchor.toLowerCase(),claim_vault:state.contracts.ClaimVault.toLowerCase(),test_token:{address:state.contracts.AFRTestUSD.toLowerCase(),symbol:'AFR-TEST-USD',decimals:18}},signers:[['gateway-demo-1','gateway',gateway.address],['operator-demo-1','operator',operator.address],['verifier-demo-1','verifier',verifier.address],['scenario-author-1','scenario_author',operator.address]].map(([key_id,role,address])=>({key_id,role,address:address!.toLowerCase(),valid_from:state.created_at,status:'active'})),verifier_programs:[{program_hash:hash('afr-verifier-pending-build'),name:'afr-verifier-svc',version:'0.1.0',build_record:'PENDING: refreshed before live execution'}]};
writeFileSync('packages/verifier-cli/trust/trusted_signers.json',JSON.stringify(trust,null,2)+'\n');
if(!state.spike){
 const {wallet:w}=clients(gateway);const ref=refId(randomHex()),commitment=hash('AFR S2 '+new Date().toISOString());
 const tx=await w!.writeContract({address:state.contracts.EvidenceAnchor,abi:anchorAbi,functionName:'anchor',args:[0,ref,1,commitment],...gas});const r=await confirmed(publicClient,tx);
 const got=await publicClient.readContract({address:state.contracts.EvidenceAnchor,abi:anchorAbi,functionName:'get',args:[gateway.address,0,ref,1]});if(got[0]!==commitment||got[1]!==r.blockNumber)throw new Error('ANCHOR_READBACK_FAILED');
 const again=await w!.writeContract({address:state.contracts.EvidenceAnchor,abi:anchorAbi,functionName:'anchor',args:[0,ref,1,commitment],...gas});const rr=await confirmed(publicClient,again);if(rr.logs.length)throw new Error('IDEMPOTENCY_FAILED');
 const conflictTx=await w!.writeContract({address:state.contracts.EvidenceAnchor,abi:anchorAbi,functionName:'anchor',args:[0,ref,1,hash('different')],...gas});
 const conflictReceipt=await publicClient.waitForTransactionReceipt({hash:conflictTx,timeout:60000});if(conflictReceipt.status!=='reverted')throw new Error('CONFLICT_NOT_REJECTED');

 state.spike={tx,block:Number(r.blockNumber),checked_at:new Date().toISOString(),submitter:gateway.address,ref,commitment,readback:true,idempotent_tx:again,idempotent_no_event:true,conflict_rejected:true,conflict_tx:conflictTx,history_72h:'PENDING',history_due_at:new Date(Date.now()+72*3600000).toISOString()};save();
}
writeFileSync('spikes/s2-anchor-rpc/evidence/initial.json',JSON.stringify(state,null,2)+'\n');console.log('S2 initial real-network checks recorded. T+72h remains PENDING.');

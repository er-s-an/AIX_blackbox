import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';import {parse} from 'dotenv';import {zipSync} from 'fflate';
import {unpack,pack,canonical,strictJson,digest,hash,randomHex,signDigest} from '../packages/core/src/index.ts';import {verify} from '../packages/verifier-cli/src/index.ts';
const path=process.argv[2]||'runs/0x06f91c2a95e0cd8bb3203f5f7d8b3a55/packet-v1.zip',id=path.split('/').at(-2)!,original=readFileSync(path),base=unpack(original),dir=process.argv.find(a=>a.startsWith("--output="))?.slice(9)||`runs/${id}/negatives`;mkdirSync(dir,{recursive:true});
const stranger=privateKeyToAccount(generatePrivateKey()),owner=privateKeyToAccount(parse(readFileSync('.secrets/gateway.env')).GATEWAY_PK as `0x${string}`);const rows:any[]=[];
async function resign(f:any,account=stranger,inventory=false){const m=strictJson(f['manifest.json']);if(inventory)for(const x of m.files){if(f[x.path]){x.sha256=hash(f[x.path]);x.bytes=f[x.path].length;}}f['manifest.json']=canonical(m);f['proofs/manifest.sig.json']=canonical({key_id:m.signer_key_id,digest:digest(m),signature:await signDigest(account,digest(m))});}
const status=(r:any,id:string,s:string)=>r.checks.some((c:any)=>c.id===id&&c.status===s);
async function test(name:string,mutate:(f:any)=>Promise<Uint8Array|void>|Uint8Array|void,expect:(r:any)=>boolean,offline=false){const f=structuredClone(base);const changed=await mutate(f),bytes=changed||pack(f);writeFileSync(`${dir}/${name}.zip`,bytes);const r=await verify(bytes,{offline});const pass=expect(r);rows.push({name,pass,result:r});writeFileSync(dir+'/results.json',JSON.stringify(rows,null,2));console.log(name,pass?'PASS':'FAIL',r.overall);}
await test('BASE',()=>{},r=>r.overall==='all_pass_in_scope');
await test('N01',f=>{const k=Object.keys(f).find(x=>x.startsWith('evidence/'))!;f[k]=canonical({...strictJson(f[k]),content:{tampered:true}});},r=>status(r,'INTEGRITY','Fail'),true);
await test('N02',f=>{delete f['mandate.json'];},r=>r.overall==='failed',true);
await test('N03',f=>resign(f),r=>status(r,'MANIFEST_SIG','Pass')&&status(r,'SIGNER_TRUST','Unknown'));
await test('N04',async f=>{const m=strictJson(f['manifest.json']);m.anchors_expected[0].chain_id=1776;f['manifest.json']=canonical(m);await resign(f,owner);},r=>status(r,'FORMAT','Fail'),true);
// N05 requires a separately exported real v2; do not invent a later chain version.
await test('N05',()=>{},r=>r.overall==='all_pass_in_scope'&&r.superseded.packet===true);
await test('N06',f=>{delete f['anchors.json'];},r=>r.overall==='all_pass_in_scope'&&status(r,'RECEIPT_PAYMENT','Pass'));
await test('N07',async f=>{const m=strictJson(f['manifest.json']);m.files.push({path:'anchors.json',sha256:hash(f['anchors.json']),bytes:f['anchors.json'].length,privacy_class:'Public'});f['manifest.json']=canonical(m);await resign(f,owner);},r=>r.overall==='failed',true);
await test('N08',f=>{const m=strictJson(f['manifest.json']);m.anchors_expected.find((a:any)=>a.type==='PACKET').ref_id='0x'+'12'.repeat(32);f['manifest.json']=canonical(m);},r=>status(r,'MANIFEST_SIG','Fail'),true);
await test('N09',f=>{const a=strictJson(f['analysis.json']);a.quotes[0].exact_substring='a fabricated quote';f['analysis.json']=canonical(a);},r=>status(r,'INTEGRITY','Fail'),true);
await test('N10',async f=>{f['proofs/salt']=new TextEncoder().encode(randomHex());await resign(f,stranger,true);},r=>status(r,'INTEGRITY','Pass')&&status(r,'SIGNER_TRUST','Unknown')&&status(r,'ANCHOR_PACKET','Fail'));
await test('N11',async f=>{const d=strictJson(f['decision.json']);d.decision_version=2;f['decision.json']=canonical(d);await resign(f,stranger,true);},r=>status(r,'MANIFEST_SIG','Pass')&&status(r,'ANCHOR_PACKET','Fail'));
await test('X01',f=>zipSync({...f,'../../etc/x':new Uint8Array([1])}),r=>status(r,'FORMAT','Fail'),true);
await test('X02',f=>{f['manifesx.json']=f['manifest.json'];const bytes=pack(f);const from=new TextEncoder().encode('manifesx.json'),to=new TextEncoder().encode('manifest.json');for(let i=0;i<bytes.length-from.length;i++)if(from.every((n,j)=>bytes[i+j]===n)){bytes.set(to,i);i+=from.length-1;}return bytes;},r=>status(r,'FORMAT','Fail'),true);
await test('X03',f=>{f['manifest.json']=new TextEncoder().encode('{"format_version":"afr-packet/1",'+new TextDecoder().decode(f['manifest.json']).slice(1));},r=>status(r,'FORMAT','Fail'),true);
await test('X04',f=>{f['trusted_signers.json']=canonical({malicious:true});},r=>r.overall==='all_pass_in_scope'&&r.warnings.includes('packaged trust config ignored'));
await test('X05',async f=>{const m=strictJson(f['manifest.json']);m.disclosure_set_id='public';f['manifest.json']=canonical(m);await resign(f,owner);},r=>status(r,'DISCLOSURE','Fail'),true);
console.log(`${rows.filter(x=>x.pass).length}/${rows.length}`);process.exitCode=rows.every(x=>x.pass)?0:1;

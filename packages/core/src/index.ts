import canonicalize from 'canonicalize';
import { sha256, keccak256, concat, toHex, toBytes, recoverMessageAddress, recoverTypedDataAddress, encodeAbiParameters, pad, type Hex, type PrivateKeyAccount } from 'viem';
import { zipSync, unzipSync } from 'fflate';
import { visit } from 'jsonc-parser';
export type Json = any;
export const utf8 = (s: string) => new TextEncoder().encode(s);
export const decode = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b);
export const hash = (b: Uint8Array | string): Hex => sha256(typeof b === 'string' ? utf8(b) : b);
function unicode(value: unknown): void {
  if (typeof value === 'string') {
    for (let i=0;i<value.length;i++) { const n=value.charCodeAt(i); if(n>=0xd800&&n<=0xdbff){ const next=value.charCodeAt(++i); if(!(next>=0xdc00&&next<=0xdfff)) throw new Error('INVALID_UNICODE'); } else if(n>=0xdc00&&n<=0xdfff) throw new Error('INVALID_UNICODE'); }
  } else if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('NON_FINITE_NUMBER');
  else if (value && typeof value === 'object') for(const [k,v] of Object.entries(value)){unicode(k);unicode(v);}
}
export function canonical(value: unknown): Uint8Array { unicode(value); const result=(canonicalize as unknown as (v:unknown)=>string)(value); if(typeof result!=='string') throw new Error('INVALID_JSON_VALUE'); return utf8(result); }
export const digest = (value: unknown) => hash(canonical(value));
export function strictJson(bytes: Uint8Array|string): Json {
 const text=typeof bytes==='string'?bytes:decode(bytes);const stack:Set<string>[]=[];
 visit(text,{onObjectBegin(){stack.push(new Set());},onObjectProperty(key){const s=stack.at(-1)!;if(s.has(key))throw new Error('DUPLICATE_JSON_KEY');s.add(key);},onObjectEnd(){stack.pop();}});
 const value=JSON.parse(text);unicode(value);return value;
}
export function randomHex(bytes=16): Hex { return toHex(crypto.getRandomValues(new Uint8Array(bytes))); }
export const without = (value:Json,...keys:string[]) => Object.fromEntries(Object.entries(value).filter(([k])=>!keys.includes(k)));
export const mandateCommitment = (mandate:Json) => hash(concat([utf8('AFR-MND-v1'),canonical(mandate)]));
export const packetCommitment = (manifest:Json,salt:Hex) => {if(toBytes(salt).length!==16)throw new Error('INVALID_SALT');return hash(concat([utf8('AFR-PKG-v1'),toBytes(salt),canonical(manifest)]));};
export const refId = (lineage:Hex,set='full') => {if(toBytes(lineage).length!==16||!['full','public'].includes(set))throw new Error('INVALID_REF');return keccak256(concat([utf8('AFR-REF-v1'),toBytes(lineage),utf8(set)]));};
export const payoutKey = (claim:Hex,version:number) => keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint32'}],[pad(claim,{size:32}),version]));
export const signDigest = (account:PrivateKeyAccount,value:Hex) => account.signMessage({message:{raw:value}});
export const recoverDigest = (value:Hex,signature:Hex) => recoverMessageAddress({message:{raw:value},signature});
export const recoverMandate = (m:Json) => recoverTypedDataAddress({...m.typed_data,signature:m.signature});
export async function signObject(account:PrivateKeyAccount,obj:Json){return {...obj,signature:await signDigest(account,digest(obj))};}
export async function verifyObject(obj:Json){return recoverDigest(digest(without(obj,'signature')),obj.signature);}
export function sameAddress(a:unknown,b:unknown):boolean{return typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();}
export async function evidence(account:PrivateKeyAccount,kind:string,content:Json,parent:Hex|null=null,keyId='gateway-demo-1'){
 return signObject(account,{schema_version:'afr-evidence/1',evidence_id:'EV-'+randomHex(4).slice(2),kind,producer:kind==='payout'?'operator':'gateway',content,content_hash:digest(content),parent_hash:parent,key_id:keyId,observed_at:new Date().toISOString(),privacy_class:'Restricted'});
}
export const EXCLUDED=new Set(['manifest.json','proofs/manifest.sig.json','anchors.json']);
export function safePath(path:string){if(path.startsWith('/')||path.includes('\\')||path.split('/').some(x=>x==='..'||x==='.'||x==='')||!/^[-A-Za-z0-9_./]+$/.test(path))throw new Error('UNSAFE_ZIP_PATH');}
export function pack(files:Record<string,Uint8Array>):Uint8Array{
 const sorted:Record<string,any>={};for(const name of Object.keys(files).sort()){safePath(name);sorted[name]=[files[name],{mtime:new Date('1980-01-01T00:00:00Z'),os:0,attrs:0}];}return zipSync(sorted,{level:6});
}
export function unpack(bytes:Uint8Array):Record<string,Uint8Array>{
 if(bytes.length>60*1024*1024)throw new Error('ZIP_TOO_LARGE');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('INVALID_ZIP');const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true);
 if(v.getUint16(end+4,true)!==0||v.getUint16(end+6,true)!==0||count>500||count===65535)throw new Error('UNSUPPORTED_ZIP');
 let p=start,total=0;const names=new Set<string>();
 for(let i=0;i<count;i++){
  if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)throw new Error('INVALID_ZIP_DIRECTORY');
  const size=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true);const name=decode(bytes.subarray(p+46,p+46+nl));safePath(name);
  if(names.has(name))throw new Error('DUPLICATE_ZIP_PATH');names.add(name);
  if((v.getUint16(p+8,true)&1)!==0||((v.getUint32(p+38,true)>>>16)&0xf000)===0xa000)throw new Error('UNSAFE_ZIP_ENTRY');
  total+=size;if(size>50*1024*1024||total>200*1024*1024)throw new Error('ZIP_EXPANSION_LIMIT');p+=46+nl+el+cl;
 }
 const files=unzipSync(bytes);if(Object.keys(files).length!==names.size)throw new Error('ZIP_DIRECTORY_MISMATCH');
 let actual=0;for(const [name,data]of Object.entries(files)){if(!names.has(name))throw new Error('ZIP_DIRECTORY_MISMATCH');actual+=data.length;if(data.length>50*1024*1024||actual>200*1024*1024)throw new Error('ZIP_EXPANSION_LIMIT');if(name.endsWith('.json'))strictJson(data);}return files;
}
export function analysisOutputDigest(a:Json){return digest({...a,model_run:without(a.model_run,'latency_ms','started_at')});}
export function inputDigest(digests:Hex[]){return digest([...digests].sort());}
export function redact(value:string){return value.replace(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g,'[REDACTED_32_BYTES]').replace(/(Bearer\s+)[^\s]+/gi,'$1[REDACTED]');}
export function hasQuote(content:Json,quote:string):boolean{const q=quote.normalize('NFC');if(typeof content==='string')return content.normalize('NFC').includes(q);if(content&&typeof content==='object')return Object.values(content).some(v=>hasQuote(v,q));return false;}

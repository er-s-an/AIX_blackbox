import {test,expect} from 'vitest';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {canonical,decode,digest,mandateCommitment,pack,unpack,utf8,strictJson,signObject,verifyObject,randomHex,packetCommitment} from './index.ts';
test('JCS sorts keys, preserves Unicode, canonicalizes numbers',()=>{expect(decode(canonical({z:1,a:{b:1e30,a:'中文'}}))).toBe('{"a":{"a":"中文","b":1e+30},"z":1}');});
test('reject duplicate JSON keys and invalid Unicode',()=>{expect(()=>strictJson('{"x":1,"x":2}')).toThrow('DUPLICATE');expect(()=>canonical('\ud800')).toThrow('UNICODE');});
test('signed authorization commitment binds signer, domain and signature',()=>{const m={typed_data:{domain:{chainId:1439},message:{task:'report'}},signer:'a',signature:null};expect(mandateCommitment(m)).not.toBe(mandateCommitment({...m,signature:'after-payment'}));expect(mandateCommitment(m)).not.toBe(mandateCommitment({...m,signer:'b'}));});
test('real secp256k1 signatures fail to recover original signer after modification',async()=>{const a=privateKeyToAccount(generatePrivateKey());const signed=await signObject(a,{amount:'8.000000000000000000'});expect(await verifyObject(signed)).toBe(a.address);expect(await verifyObject({...signed,amount:'9.000000000000000000'})).not.toBe(a.address);});
test('ZIP deterministic and safe path reject',()=>{const files={'a.json':utf8('{"a":1}'),'b.txt':utf8('hello')};expect(pack(files)).toEqual(pack(files));expect(unpack(pack(files))).toEqual(files);expect(()=>pack({'../secret':utf8('x')})).toThrow();});
test('packet salt and contents independently bind commitments',()=>{const s=randomHex();expect(packetCommitment({a:1},s)).not.toBe(packetCommitment({a:2},s));expect(packetCommitment({a:1},s)).not.toBe(packetCommitment({a:1},randomHex()));});

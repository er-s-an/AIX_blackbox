import {readFileSync} from 'node:fs';import {test,expect} from 'vitest';import {canonical,decode,hash} from './index.ts';
const vectors=JSON.parse(readFileSync(new URL('../vectors/jcs.json',import.meta.url),'utf8'));
for(const v of vectors)test(v.id+' agrees with independent canonical/sha256 reference',()=>{expect(decode(canonical(v.input))).toBe(v.canonical);expect(hash(canonical(v.input))).toBe(v.sha256);});

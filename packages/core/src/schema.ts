import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const ajv=new (Ajv2020 as any)({allErrors:true,strict:false});(addFormats as any)(ajv);
const bundled=fileURLToPath(new URL('./schemas/',import.meta.url));const dir=existsSync(bundled)?bundled:fileURLToPath(new URL('../../../schemas/',import.meta.url));
for(const name of readdirSync(dir).filter(n=>n.endsWith('.json')))ajv.addSchema(JSON.parse(readFileSync(dir+name,'utf8')),name.replace('.v1.json',''));
export function validate(name:string,value:unknown):void{const check=ajv.getSchema(name);if(!check)throw new Error('UNKNOWN_SCHEMA');if(!check(value))throw new Error('SCHEMA_'+name+': '+ajv.errorsText(check.errors));}

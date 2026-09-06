import Fastify from 'fastify';import {pages} from '../../../fixtures/catalog.ts';
const app=Fastify({logger:false});app.get('/health',async()=>({ok:true,synthetic:true}));
app.get('/suppliers/:id',async(req,reply)=>{const id=(req.params as any).id;const page=pages[id];if(!page)return reply.code(404).send({error:'Not found'});return {supplier_id:id,...page,synthetic:true};});
await app.listen({host:'127.0.0.1',port:4313});for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void app.close());

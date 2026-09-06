import {createPublicClient,createWalletClient,http,defineChain,parseAbi,parseEther,type Hex,type PrivateKeyAccount,type Address} from 'viem';
export const RPC='https://k8s.testnet.json-rpc.injective.network/';
export const ARCHIVE='https://testnet.evm.archival.chain.virtual.json-rpc.injective.network/';
export const chain=defineChain({id:1439,name:'Injective EVM Testnet',nativeCurrency:{name:'INJ',symbol:'INJ',decimals:18},rpcUrls:{default:{http:[RPC]}}});
export const anchorAbi=parseAbi(['function anchor(uint8 t,bytes32 refId,uint32 version,bytes32 commitment)','function get(address submitter,uint8 t,bytes32 refId,uint32 version) view returns (bytes32,uint64)','function latest(address submitter,uint8 t,bytes32 refId) view returns(uint32)','event Anchored(address indexed submitter,uint8 indexed anchorType,bytes32 indexed refId,uint32 version,bytes32 commitment,uint64 blockNumber)','error Conflict()','error BadVersion()']);
export const tokenAbi=parseAbi(['function mint(address to,uint256 amount)','function transfer(address to,uint256 amount) returns(bool)','function balanceOf(address owner) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export const vaultAbi=parseAbi(['function payout(bytes32 claimRef,uint32 decisionVersion,address to,uint256 amount)','function executed(bytes32 key) view returns(bool)','function paidClaims(bytes32 claimRef) view returns(bool)','function operator() view returns(address)','function token() view returns(address)','event Payout(bytes32 indexed key,bytes32 indexed claimRef,uint32 decisionVersion,address to,uint256 amount)']);
export function clients(account?:PrivateKeyAccount,url=RPC){return {publicClient:createPublicClient({chain,transport:http(url,{timeout:15000,retryCount:2})}),wallet:account?createWalletClient({chain,account,transport:http(url,{timeout:15000,retryCount:0})}):undefined};}
export async function ensureTestnet(client:ReturnType<typeof clients>['publicClient']){if(await client.getChainId()!==1439)throw new Error('WRONG_CHAIN');}
export const gas={type:'legacy' as const,gasPrice:160000000n,gas:500000n};
export async function confirmed(client:ReturnType<typeof clients>['publicClient'],tx:Hex,depth=1){
 const receipt=await client.waitForTransactionReceipt({hash:tx,timeout:60000,pollingInterval:1200});if(receipt.status!=='success')throw new Error('TRANSACTION_REVERTED:'+tx);
 const until=Date.now()+60000;while(await client.getBlockNumber({cacheTime:0})-receipt.blockNumber<BigInt(depth)){if(Date.now()>until)throw new Error('CONFIRMATION_TIMEOUT:'+tx);await new Promise(r=>setTimeout(r,800));}return receipt;
}

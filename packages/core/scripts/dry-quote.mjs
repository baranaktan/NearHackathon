// Requests one real 1Click dry quote (no deposit address, no funds) delivering
// 1 NEAR to a freshly derived stealth implicit account, and saves it as evidence.
// Usage: npm run build && npm run evidence:quote
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveStealth, generateMnemonic, keysFromMnemonic, NEAR_ASSET_ID, OneClickClient, quoteToStealth } from '../dist/index.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'evidence', 'oneclick-dry-quote.json');
const ORIGIN = 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near'; // USDC on Arbitrum
const REFUND_TO = '0x2527D02599Ba641c19FEa793cD0F167589a0f10D'; // OpenAPI example address; dry quotes never move funds

const client = new OneClickClient();
const tokens = await client.listTokens();
const nearToken = tokens.find((t) => t.assetId === NEAR_ASSET_ID);
const origin = tokens.find((t) => t.assetId === ORIGIN);
if (nearToken === undefined || origin === undefined) throw new Error('expected assets missing from /v0/tokens');

const stealth = deriveStealth(keysFromMnemonic(generateMnemonic()));
const startedAt = new Date().toISOString();
const response = await quoteToStealth(client, {
  originAsset: ORIGIN,
  amountOutYocto: 10n ** 24n,
  stealthAccountId: stealth.stealthAccountId,
  refundTo: REFUND_TO,
  dry: true,
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      note: 'Real 1Click dry quote (dry:true, no API key) from @perde/core quoteToStealth: USDC on Arbitrum -> exactly 1 NEAR delivered on NEAR to a fresh Perde stealth implicit account. Dry quotes create no deposit address and move no funds.',
      requestedAt: startedAt,
      endpoint: 'POST https://1click.chaindefuser.com/v0/quote',
      tokenListSize: tokens.length,
      nearAsset: nearToken,
      originAssetInfo: origin,
      stealthAccountId: stealth.stealthAccountId,
      response,
    },
    null,
    2,
  ) + '\n',
);
console.log(`saved ${out}`);
console.log(`amountIn ${response.quote.amountInFormatted} USDC -> amountOut ${response.quote.amountOutFormatted} NEAR, ~${response.quote.timeEstimate}s`);

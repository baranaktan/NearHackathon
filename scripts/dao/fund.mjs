// Tops the demo DAO's spendable treasury up to a target (default 3 NEAR) with a plain
// Transfer from an existing funded testnet account. Re-runnable. TESTNET ONLY.
//   npm run dao:fund [-- --target 3] [-- --from funder|deployer]
import { accountLink, assertTestnet, core, DEFAULTS, deployerAccount, makeRpc, near, readDeployment, SOURCE_FLOOR_NEAR, testFunderAccount, txLink, writeDaoDeployment } from './lib.mjs';

const { SputnikDao, parseNear, sendActions, transfer } = core;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const deployment = readDeployment();
if (deployment.dao?.daoId === undefined) {
  console.error('No "dao" entry in deployments/testnet.json; run `npm run dao:setup` first.');
  process.exit(1);
}
const daoId = deployment.dao.daoId;
const rpc = makeRpc();
const dao = new SputnikDao({ network: 'testnet', daoId, perdeContractId: deployment.contractId });

const target = parseNear(arg('target') ?? process.env.DAO_TARGET_AVAILABLE_NEAR ?? DEFAULTS.targetAvailableNear);
const fromName = arg('from') ?? process.env.DAO_FUND_FROM ?? 'funder';
const source = fromName === 'deployer' ? deployerAccount() : (testFunderAccount() ?? deployerAccount());
assertTestnet(source.accountId);

const before = await dao.getBalance();
console.log(`${daoId}: available ${near(before.available)} (total ${near(before.total)}, storage ${near(before.storageLocked)}); target ${near(target)}`);
const need = target - before.available;
if (need < parseNear('0.05')) {
  console.log('Treasury already at target; nothing to do.');
  process.exit(0);
}
const sourceBalance = await rpc.getBalance(source.accountId);
const floor = parseNear(SOURCE_FLOOR_NEAR);
if (sourceBalance - need - parseNear('0.01') < floor) {
  console.error(`${source.label} ${source.accountId} has ${near(sourceBalance)}; sending ${near(need)} would leave less than ${SOURCE_FLOOR_NEAR} NEAR. Not funding.`);
  process.exit(2);
}
console.log(`sending ${near(need)} from ${source.label} ${source.accountId} (balance ${near(sourceBalance)})…`);
const out = await sendActions({ rpc, signer: source.signer, signerId: source.accountId, receiverId: daoId, actions: [transfer(need)] });
const after = await dao.getBalance();
console.log(`fund tx: ${txLink(out.hash)}`);
console.log(`${daoId}: available now ${near(after.available)}  ${accountLink(daoId)}`);
console.log(`${source.accountId} balance now ${near(await rpc.getBalance(source.accountId))}`);
const fundingTxs = [...(deployment.dao.fundingTxs ?? []), { tx: out.hash, from: source.accountId, amount: need.toString(), at: new Date().toISOString() }];
writeDaoDeployment({ fundingTxs });

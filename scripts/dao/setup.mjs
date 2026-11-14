// Creates (or reuses) the open Perde demo DAO on SputnikDAO v2 testnet and records it
// in deployments/testnet.json under "dao". Re-runnable. TESTNET ONLY.
//   npm run dao:setup            (env: DAO_NAME, DAO_CREATE_DEPOSIT_NEAR)
import { assertTestnet, core, DEFAULTS, deployerAccount, makeRpc, near, readDeployment, SOURCE_FLOOR_NEAR, txLink, accountLink, writeDaoDeployment } from './lib.mjs';

const { SputnikDao, SPUTNIK_FACTORY, openDemoPolicy, parseNear } = core;

const rpc = makeRpc();
const deployment = readDeployment();
if (deployment.network !== 'testnet') throw new Error('deployments/testnet.json is not a testnet deployment');
const name = process.env.DAO_NAME ?? DEFAULTS.name;
const factoryId = SPUTNIK_FACTORY.testnet;
const daoId = `${name}.${factoryId}`;
const creator = deployerAccount();
assertTestnet(creator.accountId);

const bond = parseNear(DEFAULTS.proposalBondNear);
const policy = openDemoPolicy({ proposalBondYocto: bond, proposalPeriodNs: DEFAULTS.proposalPeriodNs, council: [creator.accountId] });
const config = { name, purpose: DEFAULTS.purpose, metadata: '' };

const [factoryVersion, factoryCodeHash] = await Promise.all([
  rpc.viewFunction(factoryId, 'get_default_version'),
  rpc.viewFunction(factoryId, 'get_default_code_hash'),
]);
console.log(`factory ${factoryId}: default DAO code ${factoryCodeHash} (factory metadata version ${JSON.stringify(factoryVersion)})`);

let createdTx = deployment.dao?.daoId === daoId ? deployment.dao.createdTx : undefined;
let createDeposit = deployment.dao?.daoId === daoId ? deployment.dao.createDeposit : undefined;
let createdAt = deployment.dao?.daoId === daoId ? deployment.dao.createdAt : undefined;
const existing = await rpc.viewAccountOrNull(daoId);

if (existing !== null && existing.codeHash !== '11111111111111111111111111111111') {
  console.log(`DAO ${daoId} already exists (code ${existing.codeHash}); reusing it.`);
} else if (existing !== null) {
  throw new Error(`${daoId} exists but has no contract; pick another DAO_NAME`);
} else {
  const deposit = parseNear(process.env.DAO_CREATE_DEPOSIT_NEAR ?? DEFAULTS.createDepositNear);
  const balance = await rpc.getBalance(creator.accountId);
  const floor = parseNear(SOURCE_FLOOR_NEAR);
  if (balance - deposit - parseNear('0.1') < floor) {
    console.error(`Creating the DAO needs ${near(deposit)} but ${creator.accountId} has ${near(balance)} and must keep ≥ ${SOURCE_FLOOR_NEAR} NEAR. Not creating.`);
    process.exit(2);
  }
  console.log(`creating ${daoId} from ${creator.accountId} with ${near(deposit)} attached (creator balance ${near(balance)})…`);
  const res = await SputnikDao.create({ rpc, signer: creator.signer, signerId: creator.accountId, name, config, policy, depositYocto: deposit, factoryId });
  console.log(`create tx: ${txLink(res.txHash)}`);
  if (!res.created) {
    console.error('The factory did not create the DAO (deposit refunded by the factory callback). Logs:', res.outcome.logs);
    process.exit(1);
  }
  createdTx = res.txHash;
  createDeposit = deposit.toString();
  createdAt = new Date().toISOString();
  const after = await rpc.getBalance(creator.accountId);
  console.log(`creator paid ${near(balance - after)} in total (deposit + gas); creator balance now ${near(after)}`);
}

const dao = new SputnikDao({ network: 'testnet', daoId, perdeContractId: deployment.contractId });
const [livePolicy, liveConfig, version, balance, lastId, account] = await Promise.all([
  dao.getPolicy(),
  dao.getConfig(),
  dao.getVersion(),
  dao.getBalance(),
  dao.getLastProposalId(),
  rpc.viewAccount(daoId),
]);
const openRole = livePolicy.roles.find((r) => r.name === 'open-voters');
if (openRole === undefined) console.warn(`warning: ${daoId} has no "open-voters" role; it is not the open demo policy.`);

const record = writeDaoDeployment({
  daoId,
  factory: factoryId,
  factoryDefaultCodeHash: factoryCodeHash,
  factoryDefaultVersion: factoryVersion,
  codeHash: account.codeHash,
  contractVersion: version,
  creator: createdTx === undefined ? deployment.dao?.creator : creator.accountId,
  createdTx,
  createdAt,
  createDeposit,
  proposalBond: livePolicy.proposal_bond,
  proposalPeriodNs: livePolicy.proposal_period,
  policy: 'open demo: role "all" (Everyone) may add call proposals; role "open-voters" (Member>=0, quorum 1) may VoteApprove/VoteReject/Finalize call proposals, so one approve vote executes; role "council" (creator) has *:*',
  storageBytes: account.storageUsage,
});

console.log('');
console.log(`DAO:          ${daoId}  ${accountLink(daoId)}`);
console.log(`name/purpose: ${liveConfig.name} — ${liveConfig.purpose}`);
console.log(`version:      ${version} (code ${account.codeHash})`);
console.log(`bond:         ${near(BigInt(livePolicy.proposal_bond))}; proposal period ${Number(BigInt(livePolicy.proposal_period) / 1_000_000_000n)} s`);
console.log(`roles:        ${livePolicy.roles.map((r) => `${r.name}=${JSON.stringify(r.kind)} [${r.permissions.join(', ')}]`).join('; ')}`);
console.log(`treasury:     total ${near(balance.total)}, storage ${near(balance.storageLocked)}, available ${near(balance.available)}`);
console.log(`proposals:    ${lastId}`);
console.log(`recorded in deployments/testnet.json → dao: ${JSON.stringify({ daoId: record.daoId, createdTx: record.createdTx })}`);

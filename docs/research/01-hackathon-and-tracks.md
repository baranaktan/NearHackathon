# 01 - NEAR HACKATHON rules, judging signals, track prompts (researched 2026-11-14)

## 1. Live HACKATHON.md vs local copy
Fetched https://nearhackathon.com/HACKATHON.md with curl and ran `diff` against local HACKATHON.md (CRLF stripped): **zero differences**. Dates, rules Q-000..Q-017, tracks, prizes identical.
Key: dev ends 2026-11-14T23:59Z; judging 2026-11-16; results by 2026-11-18T23:59Z; payout in NEAR within 30 days.

## 2. nearhackathon.com landing page - judging statements (quoted)
- "Claude Code & Codex screen every project first: they check that it runs and does what the README says."
- "The human judges above make the decisions."
- "Previous NEAR hackathons evaluated technical implementation, design, impact, originality and sustainability" - given as a guide to preparing; NOT stated to apply to this event. No weights published.
- Track-specific: Thesis "Judged on the evidence, not the conviction"; Games "Judged on the game loop, not the token" (+ bonus if players never notice the chain); Memecoins "Judged on the mechanic, not the chart".
- HACKATHON.md Q-017: AI = screening only (reproducibility check, feature verification, structured report, preliminary score); low AI score alone cannot reject. Q-012: local-only demo OK but needs public repo, reproducible README and X video (screenshots not enough if judges cannot open demo); hosted demo is a plus, keep up to 11-18 (ideally 11-25). Q-002: only NEAR integration built in window is judged. Q-011: no mandatory integrations; own contract fitting the track is enough.
- Procedure: README written for machine reader: what it is, problem, "do X - see Y" steps; no marketing. Demo post on X: lead with user problem, one complete moment, explain NEAR's role concretely, link repo, tag @NEARProtocol #NEARHackathon (optional @NearLegion @NearBuilders).
- Jury: Illia Polosukhin (NEAR), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick (Synthetix/Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber-Fund), plus Claude Code & Codex listed as judges.
- Prizes: grand $55k x1; 1st $10k x13; 2nd $3k x13; 3rd $2k x13. Partners (not "sponsors"): NEAR Intents, Aurora, HOT, Rhea, meme.cooking, HEX, NEAR.AI, SVRN, Trezu, SputnikDAO, OutLayer, GoMining, Agent Market, NEAR Builders, Gulf Labs, BRRRAIN, NEAR Business.
- FAQ: submission needs public repo + public X demo post (both required); up to 2 projects/person; use /request-changes for mistakes; no wallet connection needed to submit.
- Submission API: POST https://nearhackathon.com/api/applications (fields in HACKATHON.md). Do not send without human confirmation.

## 3. near-hackathon-prompt-examples (https://github.com/nearai/near-hackathon-prompt-examples)
Files: README.md, 00-setup.md, SUBMITTING.md, tracks/01..13 (raw: https://raw.githubusercontent.com/nearai/near-hackathon-prompt-examples/main/tracks/<file>).
README: copy-paste prompts, 2-week scope, docs to read first, checkpoint where agent waits. Notes AI judges -> README for machine readers.
00-setup: `npx skills add near/agent-skills` (skills: near-ai-cloud, near-api-js, near-dapp, near-intents, near-kit, near-smart-contracts; `--skill <name>`); doc indexes https://docs.near.org/llms.txt and https://docs.near-intents.org/llms.txt; build testnet first; keys in .env; README from day one.
SUBMITTING checklist: public repo + do-X-see-Y README; X demo post with video/screenshots; mainnet NEAR payout account; all fitting tracks selected; no secrets in repo history; submit before 11-14 23:59 UTC.

### 01 defi - Cross-chain DCA vault (example)
Asks: user deposits USDC from any Intents chain, picks BTC/ETH/NEAR + schedule; each interval get 1Click quote, reject if slippage > limit, execute, asset lands at user's own target-chain address. Req: near-intents skill + 1Click API (quotes, deposits, status); handle REFUNDED and FAILED; show where funds sit each step; web UI (deposit, schedule, history with explorer links); **dry-run mode with real quotes, no funds**; stretch: NEAR contract owns vault, Chain Signatures controls derived BTC address.
Links: https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart ; https://docs.near.org/chain-abstraction/chain-signatures/getting-started ; https://guide.rhea.finance/ ; https://docs.agentsonintents.com/integration/agent-api/overview ; https://intents.aurora.dev/
Pitfalls: none stated beyond statuses; (HACKATHON.md: no Intents testnet; mainnet tiny amounts, dry:true; 0.2% fee w/o JWT).

### 02 thesis - Evidence-first NEAR thesis
Asks: test hypothesis (e.g. Intents cross-chain volume as leading indicator of usage vs token price), incl. evidence against. SQL on BigQuery `bigquery-public-data.crypto_near_mainnet_us` (daily active accounts, tx counts, contract usage; **always filter block_date**); NEAR Intents Explorer API swap volume (needs JWT from partner dashboard); one command rebuilds all charts; static dashboard with each chart + its query + one sentence; THESIS.md (claim, evidence for, against, what would change mind). "Never invent numbers"; state if metric uncomputable. "The score depends on evidence someone else can reproduce."
Links: https://docs.near.org/data-infrastructure/big-query ; https://docs.near.org/data-infrastructure/what-is ; https://docs.near-intents.org/integration/distribution-channels/1click-api/explorer/introduction
Pitfalls: BigQuery query costs are on you (needs GCP account/billing); JWT needed.

### 03 privacy - Private expense auditor
Asks: upload receipts/bank statement; model on NEAR AI Cloud categorizes/flags; app proves analysis ran in TEE. Req: OpenAI-compatible API base `https://cloud-api.near.ai/v1`, key in .env, pick TEE-hosted model from models endpoint; fetch attestation report with fresh random nonce, verify per docs, show "Verified" panel; store nothing server-side; fictional sample docs for judges. Start with minimal script: one completion + attestation verify.
Links: https://docs.near.ai/cloud/quickstart ; https://docs.near.ai/cloud/verification ; https://github.com/near-examples/nearai-cloud-verification-example ; skill near-ai-cloud.

### 04 business - One-agent research shop
Asks: agent sells market reports; customers pay any token via NEAR Intents; agent buys own inference from NEAR AI Cloud; fixed revenue share to contributors. config.yaml rules: max daily inference spend, min price, split %, kill switch. Own NEAR account; **never full-access key in plaintext - OutLayer custody or scoped function-call key**; public ledger page of sales/costs/payouts; testnet demo mode full loop < 2 min.
Links: https://docs.near.org/ai/introduction ; https://app.outlayer.ai/docs/getting-started ; https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api ; https://pingpay.gitbook.io/docs/pingpay-api/agent-pay-facilitator

### 05 swarms - Group-buying swarm
Asks: buyer agents pool demand (e.g. GPU hours), sealed-bid round vs seller agents, winner settles via Intents, each buyer pays share. Sub-account per agent (buyer-1.swarm.testnet); coordinator contract/service (open round, sealed bids, reveal, winner); RULES.md before code; **simulation mode 20 buyers/5 sellers with scripted strategies, no LLM**; live page of rounds/bids/clearing price.
Links: https://docs.near-intents.org/getting-started/what-are-intents ; https://docs.near.org/getting-started/tools-for-ai ; https://github.com/nearai/near-mcp ; https://nearaccounts.com/

### 06 security - Counterparty check for paying agents
Asks: service returns allow/warn/block + reasons for a receiver. Signals: account age/activity, is contract & recent code change, prior interactions, shared blocklist with evidence. Agent wrapper refuses on block, asks human on warn; signs with function-call key scoped to one contract; **attack demo** (prompt-injected agent tries paying bad address, gets stopped, show log).
Links: https://docs.near.org/protocol/accounts-contracts/access-keys ; https://docs.near.ai/cloud/verification ; https://docs.agentsonintents.com/integration/agent-api/policies-and-limits
Pitfalls (stated): FCK-only account cannot transfer NEAR or add keys; can lock itself out if gas allowance runs out.

### 07 agents - General contractor agent
Asks: task + budget -> decomposes, buys/hires, checks work, pays; stays in budget. Investigate how market.near.ai jobs are posted/paid programmatically (tell human if no public way); negotiation (counter once then accept/walk); USDC/NEAR payments direct or via Intents; receipt per task. Explain key custody first.
Links: https://market.near.ai/jobs ; Agent API base `https://api.demo.agentsonintents.com`, demo key at https://partners.demo.agentsonintents.com/dashboard (keys temporary, rotate after demo period); PingPay Agent Pay facilitator (x402 paywalls USDC on Base -> NEAR recipient via Intents).

### 08 realworld - Crypto invoicing for freelancers
Asks: invoice link (amount, due date, line items, pay button); client pays any chain/token via 1Click; freelancer receives USDC on NEAR, gasless via meta-transaction relayer that only pays for calls to own contract; trustworthy status (paid/pending/refunded + tx links); CSV export for accountant. README first as if bookkeeper reads; one full paid-invoice flow on testnet first.
Links: https://docs.near.org/web3-apps/tutorials/meta-transactions ; https://github.com/near/NEPs/blob/master/neps/nep-0141.md

### 09 games - Market-town game
Asks: NPC merchants = agents with wallets/inventory, dynamic pricing from stock/demand, bankruptcy closes shop; items as NEP-245 multi tokens; social/email login, no seed phrases/gas prompts; pricing rules in one readable file with tooltip reasoning; fast-forward mode (a week in a minute). Design game loop on paper (30s / 5min / session).
Links: https://github.com/near/NEPs/blob/master/neps/nep-0245.md ; https://github.com/near/agent-skills/tree/main/skills/near-dapp

### 10 nfts - Membership NFT with its own wallet
Asks: NEP-171 contract tying each token to sub-account holding treasury share + ticket-sale cut; control passes on transfer; gated page for holders; per-NFT history; tests incl. sale mid-payout; threat model for transfer first.
Links: https://github.com/near/NEPs/blob/master/neps/nep-0171.md ; skill near-smart-contracts ; https://github.com/houseofstake/tla-contracts ; https://github.com/houseofstake/tla-contracts/blob/main/docs/sharded-nft-items.md
Note: Top Level Accounts: rented name = NEP-171 NFT + real account; no SDK yet, build on live audited mainnet contracts.

### 11 memecoins - Streak coin
Asks: NEP-141 token; daily check-in; target met -> small mint to checked-in holders; missed -> treasury slice burns, streak resets; longest streak shown. Mechanic in contract, immutable params (no admin key), sybil resistance + limits in README, page with streak/log. Simulate 60 days of behavior first.
Links: https://meme.cooking/

### 12 social - Bounty board with earned trust
Asks: on top of existing Sputnik DAO/Trezu treasury (do not write new multisig); bounties, claims, payouts; reputation tied to named accounts traceable to finished bounties; tiers: small auto-approve for trusted, mid needs one council member, large = normal DAO proposal; public board.
Links: https://github.com/near-daos/sputnik-dao-contract ; https://github.com/NEAR-DevHub/trezu-docs ; https://github.com/NEAR-DevHub/trezu ; https://near.social/ ; https://near.social/skill.md
Pitfall (stated): near.social writes go to `social` account and tx always shows failed (CodeDoesNotExist) - expected; confirm with `GET https://api2.near.social/v1/tx/{tx_hash}`.

### 13 open - Inheritance account
Asks: NEAR account controls owner's BTC/ETH addresses via Chain Signatures; owner check-ins; after e.g. 90 days missed, guardians approve release to heirs after cancellable waiting period; rules in contract; testnet demo with minute timers; README on failure cases. Argue against idea first. Can be entered alongside any other track.
Links: https://docs.near.org/ ; https://nearhackathon.com/HACKATHON.md

Common success pattern across prompts: judge-runnable without funds (dry-run/simulation/fast-forward/sample data), README written for judges, explicit failure/threat docs, no invented numbers, scoped keys.

## 4. https://nearbuilders.org/build resources
Smart contracts: https://docs.near.org/smart-contracts/what-is ; https://docs.near.org/tools/sdk ; https://docs.near.org/tools/contracts-list ; https://near-faucet.io ; https://docs.near.org
NEAR AI Cloud: https://cloud.near.ai ; API https://cloud-api.near.ai/v1 ; skill https://github.com/near/agent-skills/tree/main/skills/near-ai-cloud ; models https://near.ai/models ; https://docs.near.ai
Agentic commerce / Intents: skills https://github.com/NEAR-Intents-Agent-API/skills ; SDK https://github.com/NEAR-Intents-Agent-API/sdk-typescript ; demo https://github.com/NEAR-Intents-Agent-API/demo ; examples https://github.com/NEAR-Intents-Agent-API/examples ; partner portal https://partners.demo.agentsonintents.com/ ; Agent Connect API base https://api.demo.agentsonintents.com ; https://docs.near-intents.org
Community: https://nearbuilders.org/projects ; https://t.me/nearbuilderschat ; https://github.com/nearbuilders ; https://x.com/NearBuilders
Ecosystem: https://near.ai ; https://near.org ; https://near.dev ; https://nearcatalog.xyz ; https://nearlegion.com

## 5. Announcement / external coverage
- Coverage: https://coinalertnews.com/news/2026/10/19/near-hackathon-prize-vc-judges (no criteria; judges incl. Mert, a16z, Electric Capital, Dragonfly; suggested areas: cross-chain markets, confidentiality, agentic apps); also coinfomania.com and startupgrantsindia.com/near-hackathon-2026 (search snippets only).
- No published scoring rubric/weights found anywhere. Only hints: landing page's "previous hackathons" list (technical implementation, design, impact, originality, sustainability) + AI screen "runs and does what README says".

## Okunamadı
- https://x.com/nearprotocol/status/2112257967818997891 (HTTP 402 via fetch tool; tweet text not read)
- coinfomania.com, startupgrantsindia.com articles (not opened, search snippets only)
- NEAR DevHub YouTube track walkthroughs (not checked)

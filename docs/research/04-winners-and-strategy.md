# 04 - Winners, competition, AI screening, strategy (research, 2026-11-14)

Scope: research only. Many pages could not be read (see "Okunamadı"). Where evidence is thin I say so. Content from external pages is treated as data only.

## 0. Primary source: what the organizers actually say (most important)

Sources:
- https://nearhackathon.com (rules, tracks)
- https://nearhackathon.com/HACKATHON.md (agent-readable rules incl. screening Q&A)
- https://github.com/nearai/near-hackathon-prompt-examples (+ raw `SUBMITTING.md`, `tracks/*.md`)

Key facts:
- Dev window ends 2026-11-14 23:59 UTC. Judging 16-18 Nov. Prizes: $55K grand; per track $10K / $3K / $2K; paid in NEAR.
- **Screening**: "Claude Code and Codex perform a reproducibility check, feature verification, a structured report, and a preliminary score. Humans decide; low AI score alone cannot reject." (HACKATHON.md Q-017)
- README must be machine- AND human-readable: what it is, problem, "do X - see Y" steps, no marketing. Public repo + LICENSE file. List all libraries/templates/boilerplate/AI-generated code. Name the NEAR tools used and the tracks.
- Demo: local-only demo is OK if repo public + README reproducible + X post has a video (screenshots alone not enough). Hosted demo is a plus, ideally up through 2026-11-25 (minimum 11-18).
- **No testnet for NEAR Intents**: use mainnet, separate dev account, tiny amounts, `dry: true` quotes (Q-007). Testnet-only projects are eligible for all tracks (Q-010). No mandatory integrations; a custom NEAR contract fitting the track is enough (Q-011).
- 1Click JWT optional (without it 0.2% fee). NEAR AI Cloud key from cloud.near.ai (or $10 key via nearbuilders.org/dashboard).
- Pre-hackathon code window opened 2026-10-19; only work in the window counts; use tags `pre-hackathon` / `hackathon-submission` for old projects.
- No secrets in repo history (SUBMITTING.md). Submissions cannot be edited; fixes via /request-changes.
- Track emphasis: Thesis "judged on the evidence, not the conviction"; Games "game loop, not the token" (bonus if players never notice the blockchain); Memecoins "the mechanic, not the chart".
- Named NEAR tech hints: Intents, Chain Signatures, meta transactions, NEAR AI Cloud, TEE attestation, function call keys, sub-accounts, NEP-141/171/245, Sputnik DAO, Trezu, OutLayer, Agent Market, partners (Aurora, HOT, Rhea, HEX, meme.cooking...).

### Organizer sample prompts per track (these are the "default" ideas many entrants will build; Claude/Codex users paste them)
| Track | Sample prompt (tracks/*.md) | Notable built-in requirements |
|---|---|---|
| defi | Cross-chain DCA vault via 1Click | handle REFUNDED/FAILED, dry-run mode, small web UI, history w/ explorer links |
| thesis | "Intents volume is a better leading indicator than price" | BigQuery SQL on `crypto_near_mainnet_us`, Explorer API (JWT), one rebuild command, THESIS.md with contrary evidence |
| privacy | Private expense auditor on NEAR AI Cloud | attestation w/ fresh nonce, "Verified" panel, no retention, sample data |
| business | One-agent research shop selling reports | config.yaml limits + kill switch, no full-access key (OutLayer or FCAK), public ledger, 2-min testnet demo mode |
| swarms | GPU-hours group-buying swarm | sub-account per agent, sealed-bid coordinator, RULES.md first, 20 buyers/5 sellers sim without LLM |
| security | Counterparty-check service (allow/warn/block) | FCAK scoped to one contract, prompt-injection attack demo with log |
| agents | "General contractor" agent that hires agents | Agent Market, one counteroffer, receipts |
| realworld | Freelancer crypto invoicing | 1Click pay link, meta-tx gasless, CSV for accountant, README for a bookkeeper |
| games | Market-town with agent merchants | NEP-245 items, social login, fast-forward sim |
| nfts | Membership NFT that carries its own wallet (sub-account) | NEP-171 + threat model, gated page, transfer-during-payout test |
| memecoins | "Streak coin" | mechanic enforced in contract, immutable params, 60-day simulation |
| social | Bounty board with earned trust on Sputnik DAO/Trezu | 3 approval tiers, reputation traceable to bounties |

Takeaway: the organizer prompts show what the AI screener's rubric likely looks like: **deterministic demo/simulation/dry-run mode, sample data, scoped keys (never full-access), threat model/README for a named reader, tests for the tricky path, a public ledger/history page**. Copying the checklist items of the prompt for your track is nearly free score; but picking the exact sample idea means maximal crowding.

## 1. Past NEAR hackathon winners (evidence is thin; be skeptical)

I could not retrieve full winner lists for most NEAR events (Devpost/Taikai/DoraHacks pages blocked, see Okunamadı). Verified items:

| Event | Winner | Idea | NEAR tech | Why it stood out (source's framing) |
|---|---|---|---|---|
| ETHGlobal Unite DeFi 2025 - NEAR prize "Best 1inch Fusion+ Solver built with Shade Agent Framework" | **TotalFusion** | Multi-chain extension for 1inch Fusion+: atomic swaps ETH<->NEAR/Cosmos/BTC | Shade Agent (TEE solver, Intel TDX attestation), Chain Signatures MPC | Live Sepolia demo with real token transfers; modular chain adapters; triple signing fallback (TEE -> Chain Sigs -> key); mock provider for tests; Docker-image hash vs attestation. https://ethglobal.com/showcase/totalfusion-c58sy |
| ETHGlobal Brussels 2024 - NEAR "Chain Signatures: Cross-Chain Without Bridges" ($5K) | **bxlETH** | Multichain ETH liquid staking, value synced across chains | Chain Signatures | Used the sponsor's flagship primitive as the core mechanic (not a bolt-on). https://ethglobal.com/showcase/bxleth-escy3 |
| ETH Seoul | **DeFiBrain** | (idea not retrieved) | Chain Signatures | Won NEAR chain-signature bounty AND ETH Seoul 1st (per NEAR recap, not verified directly). https://pages.near.org/?p=21306 |
| One Trillion Agents (Jan 31-Mar 2 2025; Bitte + NEAR AI + Hackbox) Bitte bounty | **CoolFi** (BTC+Intents+Twitter chat portfolio/swaps), **betVEX** (esports betting agent), **SatSlinger** (BTC tipping agent on Twitter), **Gains.Trade agent** | Chat agents automating complex on-chain actions | Bitte embeddable chat, Intents, Chain Signatures (BTC) | Article: automation of complex flows + conversational UX + Bitcoin interop recurring. https://bitteprotocol.substack.com/p/from-experiment-to-adoption-how-bittes ; tracks were DeFi/Social/Absurd Agents ($20K/$20K/$10K) per https://allhackathons.com/hackathon/one-trillion-agents-hackathon |
| Zypherpunk 2025 (not NEAR-run) | **ZIntents** (Zcash shielded withdrawals, limit orders, scheduled randomized withdrawals, cross-chain swaps) | Built on NEAR Intents | Covered in "top 5 privacy projects" list. https://hackernoon.com/zypherpunk-hackathon-2025-review-top-5-privacy-projects-that-will-disrupt-defi |
| Zypherpunk 2025 | **ZOLANEAR / ShadeLink** (Shade Agents + Intents; $5,000) | Solana<->Zcash-ish routing via Shade+Intents | Shade Agents, Intents | page unreadable (connection refused); listing only via search result https://zypherpunk-results.pages.dev/project/zolanear-shadelink-9c31 |
| Zcash x NEAR Intents (Mar 17-28 2025, $70K) | winners not retrieved | | | https://taikai.network/en/hackbox/hackathons/zcashxnear/prizes |

Not found / unverified: winners of NEAR "[REDACTED]" hackathon (Devpost, Bangkok finale Nov 9-11 2024; Native track prizes up to $50K NEAR), NEARCON IRL 2023 winners, NEARCON 2026 "Agent Hackathon / Agent Wars" winners (4,000 NEAR pool, announced 2026-02-24), MetaBUILD winners, Agents Without Masters (DoraHacks). I did not find any 2026 NEAR-run winner list yet (judging 16-18 Nov).

### Patterns (inferred; confidence moderate-low)
1. Winners used the sponsor primitive **as the core mechanism** (Chain Signatures for cross-chain state; Shade Agent TEE as the solver), not a thin wrapper.
2. **Live end-to-end testnet/mainnet transaction** evidence (TotalFusion: real Sepolia transfers).
3. Engineering robustness signals: fallbacks, mock providers for tests, attestation checks.
4. Agent products win when they **automate a multi-step cross-chain action behind one prompt**, but chat-agent wrappers became a crowded pattern by 2025 (Bitte had 14 of top 40 projects).
5. Cross-chain + Bitcoin/Zcash interop recurs; privacy+Intents (ZIntents) placed in third-party reviews.
6. Prior NEAR criteria (per nearhackathon.com): technical implementation, design, impact, originality, sustainability (a preparation guide, not an official rubric).

Other sources: https://aurora.dev/blog/encodexarurora-hackathon-highlights (not read), https://near.foundation/blog/near-at-ethdenver-hackathon-bounty-winners/ (404).

## 2. Current competition (snapshot 2026-11-13/14, GitHub search API; counts are noisy because "near" also matches the English word)

- GitHub search `near hackathon created:>2026-10-19`: **529 repos** (unfiltered, includes noise and empty forks).
- `near agent` (created > Oct 31): 446; `near intents`: 142; `near privacy`: 68; `near game`: 64; `near dao`: 60; `near memecoin`: 47; `near swarm`: 39; `near thesis`: 39; `near nft`: 39; `near x402`: 31; `near prediction market`: 9; `near invoice` + hackathon: 9. Several other queries were rate-limited (403).
- Sample of 19 repos seen (first page of the "near hackathon" result): TriagePay (agent policy wallet w/ x402 + spend limits), tide (memecoin supply as fish stock), Evergreen (self-renewing top-level names), localagentpay (local commerce w/ Intents previews), Heavy-Is-The-Crown (memecoin bracket launchpad), chickens-of-yolk-street (agent egg market), nims (NEP-245 market town), hidra-market (sealed-bid agent work market, escrow, reputation), stanza-crosschain (licensing registry via Chain Signatures + 1Click), Earmark (family account spending rules / AI pays bills), bankkeeper (fishing-port economy game), loud (memecoin launch with shared exit cap), tidewater-market (agent shopkeeper game), ostrich (private on-device finance). Others found by search: Paid in Full (invoice->payment desk, realworld/business/agents), Arkhe Guard (mandate-bound agent, security), Autonomous Treasury Mesh (policy treasury, live testnet policy contract), AgentProof (Agent Economy; README says "proposed architecture is not a completed integration").
- Sources: https://api.github.com/search/repositories?q=near+hackathon+created:>2026-10-19 and the repos named above on github.com.

### Crowded vs empty (best-effort reading)
- **Very crowded**: agents / agent-economy / "AI agent + wallet + spend limits" (security-ish policy wallets: at least TriagePay, Arkhe Guard, Treasury Mesh, Earmark), Intents-based swap/DCA in DeFi, memecoin "creative mechanics" (fish stock, brackets, streaks), market-town games with agent shopkeepers (the prompt example), sealed-bid agent markets.
- **Moderately crowded**: privacy (expense auditor from prompt), social/DAO bounty boards (prompt example), invoicing (prompt example; few repos seen so far, but the prompt invites many).
- **Likely thin**: investment thesis (needs data work, few will bother; but 39 noisy hits), NFTs-that-do-something beyond the membership-wallet prompt, real-world money beyond invoicing (payroll, remittances), Social Money with Trezu specifically, prediction markets (9).
- Overdone: another swap UI, another AI trading bot, chat-agent wrapper, "agent has a wallet" with no adversarial demo, memecoin with a cute theme but off-chain logic.
- Caveat: this is a proxy. Lots of teams submit via the form without public activity, and the last 24 hours always see a surge.

## 3. AI-screened hackathons: what scores well

Direct sources are scarce; the organizer files above are the best evidence. Supporting: 
- Devfolio's LLM-judge write-up https://devfolio.co/blog/the-discerning-machine/ : the judge reads the pitch then walks the repo (read/grep/ls), checks claims against code, demo-to-repo consistency, cites file:line per criterion. Scores **drop when the pitch outruns the code** (a claimed security property not implemented dropped 8->5); score **rises when code goes further than the pitch**. A longer README = more claims to disprove; a blank README has less to disprove.
- Other examples of agent judges: Havoc Hackathon (Opus/GPT/Codex panel, anonymized) via https://awesome.ecosyste.ms/projects/github.com%2Fdubsopenhub%2Fhavoc-hackathon ; TestSprite requires agent logs; ~100 submissions judged for <$2.

Actionable checklist (derived from organizer docs + the above):
1. README top section: 3 lines what/problem/tracks, then "Quickstart" with ONE command (e.g. `make demo` / `npm run demo`) that needs **no secrets**: deterministic seed, recorded fixtures (quotes, attestation), local/testnet only.
2. "Verify it yourself" table in "do X - see Y" format: command -> expected output (paste real output) -> on-chain evidence (testnet account id, tx hash, nearblocks link).
3. Feature-claim table: each claim -> file path -> test name. Only claim what exists; mark stubs honestly ("Not implemented").
4. Real tests (`npm test`/`cargo test`) that pass on a clean clone; CI badge optional. Pin versions, commit lockfile; state Node/Rust versions.
5. Secrets: `.env.example` with names only; secret-requiring paths have a mock/replay mode; run a secret scan over git history before pushing.
6. Evidence block: deployed contract ids, example tx links, Intents `dry: true` quote JSON saved in `/evidence`; NEAR AI attestation report saved with nonce.
7. List all libs/boilerplate/AI-generated code (explicitly required); LICENSE file; name NEAR tools and tracks.
8. Threat model / limits section (the prompts for nfts, security, memecoins demand it) - screeners reward honesty about limitations.
9. Fast demo: scripted 2-minute path; fast-forward/simulation mode; public ledger page.
10. Host a demo URL if cheap and keep it up through 2026-11-25.

## 4. General hackathon-winning patterns (10 most actionable)
Sources: https://blogs.reskilll.com/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/ , https://chain.link/blog/blockchain-hackathon-tips , https://tips.hackathon.com/article/creating-the-best-demo-video-for-a-hackathon-what-to-know , https://thegraph.com/blog/ethglobal-lisbon-2026-winners/ (winner traits), https://www.theblock.co/post/326975/ethglobal-hackathons-10-finalists-showcase-ai-agents-crypto-games-dao-tools-and-more (finalist mix). Note: no first-party ETHGlobal rubric was found; items are consensus advice plus inference.
1. One clear problem, one hero flow. Do one thing end-to-end rather than five half-done.
2. Open the video with the working product in the first 10 seconds, not slides.
3. Video structure (~2 min): hook/problem (10s) -> live demo of the single complete moment (70s) -> "how it works on NEAR" one diagram (20s) -> evidence + what's next (20s). Captions, no dead air.
4. Show the real chain: explorer link on screen for the key transaction.
5. Make the sponsor tech essential and visible (name the primitive in the video: "function-call key", "Chain Signatures").
6. Record a backup demo; rehearse the failure points; pre-fund accounts.
7. Judge-proof README so non-viewers can evaluate (repo as silent tiebreaker).
8. Pitch the product, not the code; product + clear user + reason it's only possible on this stack.
9. Winners often treat provenance/verifiability as a feature (Graph winners: provenance, freshness, standardized schemas; cross-domain use cases like cold-chain, hotel underwriting).
10. Submit early with a buffer; re-test from a clean clone; post the X thread with video, tag @NEARProtocol and #NEARHackathon.

## 5. Eight project ideas (ranked by estimated win probability)

Assumptions: solo dev + coding agents, ~18h, testnet demo, Intents via mainnet dry quotes. Probabilities are subjective judgment, not data.

### 1. "Lease-a-Wallet": rentable account-NFT with expiring access keys (nfts + games + social)
- Idea: an NFT whose sub-account holds game inventory/funds. The owner can rent it: the contract adds a time-limited, function-call-only key for the renter (can play/trade via one game contract, cannot withdraw). At expiry/sale the key is deleted by a keeper or on next call; sale during rental is handled.
- NEAR depth: sub-accounts, function-call access keys (allowance, method allowlist), NEP-171, meta-tx so renter has no gas, optional NEP-245 items.
- Demo moment (2 min): Alice lists her "Hunter" NFT -> Bob rents for 10 min -> Bob's key plays and earns, tries to withdraw and is rejected on-chain -> timer ends, key revoked, Alice gets rent + a share of earnings; explorer links throughout.
- Why it wins: genuinely NEAR-native (access keys as leasing), memorable, deterministic on testnet, goes beyond the organizer's "membership wallet" sample. Risk: key add/delete mechanics and expiry enforcement; prompt demands a threat model and transfer-during-rental test (do it).
- Win probability: highest (est. 25-30% for a top-3 in nfts, ~10% grand).

### 2. "Red Team Arena": mandate wallet with a reproducible attack suite (security + agents + business)
- Idea: not just another policy wallet; the deliverable is the **attack harness**: `npm run attack` runs N (e.g. 12) prompt-injection / drain / key-escalation / allowlist-bypass attempts against (a) an unprotected agent and (b) the agent using a policy contract + scoped FCAK + counterparty check; prints a pass/fail table with tx evidence.
- NEAR depth: FCAK (and its limits: no transfers, gas-allowance lockout), policy contract holding funds, Sputnik DAO proposal to raise limits, counterparty check from on-chain history.
- Moment: split screen, unprotected agent drained, protected agent blocked with on-chain failure; owner revokes with one click.
- Why: aligns with the AI-screener's love for deterministic verification; but track is crowded (TriagePay, Arkhe Guard, Treasury Mesh), so the harness + honesty about limits is the differentiator. Est. 15-20% top-3 in security.

### 3. "Sealed Bid, Proven Fair": TEE-attested confidential procurement auction (privacy + swarms + business)
- Idea: buyer agents submit sealed bids; selection runs inside NEAR AI Cloud TEE (or Shade-style) which returns a signed attestation; only the winner and clearing price are revealed; losers' bids never leave the enclave; settlement via 1Click dry quote + sub-account per agent.
- Moment: 5 agents bid, loser's bid stays hidden, "Verified" panel shows attestation checks, winner paid.
- Risk: needs NEAR AI Cloud key; ship replay mode with recorded attestation fixture and a "live" path. Crowded neighbor: hidra-market, GPU group-buy prompt. Est. 12-15%.

### 4. "Attested Analyst": self-funding agent business with receipts (business + privacy + agents)
- Idea: agent sells reports; customer pays any token via 1Click; agent buys its own TEE inference; revenue split to contributor sub-accounts; owner kill switch is a Sputnik DAO proposal; every report carries an attestation hash anchored in a NEAR contract; public ledger.
- Mostly the organizer sample; win needs polish plus the attestation-anchored ledger. Est. 10-12% (many will build it).

### 5. "Payroll Without Borders": DAO-approved multi-chain payroll (realworld + social + defi)
- Idea: Sputnik DAO/Trezu approves a payroll batch; each employee receives in their preferred chain/token via 1Click (dry quotes on mainnet, execute tiny real one for the video); gasless claim via meta-tx; accountant CSV; refunds shown.
- Moment: one DAO vote -> 3 people paid in USDC on Base, SOL, and NEAR. Est. 10%. Less crowded than invoicing but "pay in any chain" demos may repeat.

### 6. "Escrow Court": agent-to-agent job escrow with deterministic acceptance checker and DAO arbitration (agents + swarms + security)
- Idea: requester locks funds; executor delivers; deterministic checker (versioned, precommitted criteria) releases or disputes; disputes go to a Sputnik DAO proposal of 3 arbitrators; reputation on named accounts. Demo includes pass, fail, and overspend-blocked.
- Competes with AgentProof/hidra; strong on "verifiable" but easy to under-deliver. Est. 8-10%.

### 7. "Evidence-first NEAR thesis": reproducible Intents-flow analysis (thesis + defi + open)
- Idea: one command rebuilds all charts from a **committed data snapshot** (BigQuery export + Explorer API pull) with a refresh path for those with credentials; THESIS.md includes contrary evidence and falsification criteria; a tiny backtest of "Intents volume leads active accounts".
- Likely thin field, judged on evidence; low upside beyond a track prize. Est. ~15% for top-3 in thesis but ~2% grand.

### 8. "Group Tab": multi-chain bill split on sub-accounts (social + realworld)
- Idea: a tab sub-account per dinner; each friend pays from their own chain/token via 1Click quote; settle to payer; refund handling; shareable link.
- Easy, but low novelty and weak "NEAR-native depth". Est. 5-8%.

Ranking rationale: novelty vs. organizer samples, depth of NEAR-native primitives, deterministic testnet demo (AI-screener friendly), one clear moment, and crowdedness of the target track.

## 6. Recommendation summary
- Choose something whose hero flow runs with `make demo` and zero secrets; add live testnet evidence.
- Don't build the exact organizer sample prompt without a twist; do mirror its listed requirements (they hint at the rubric).
- Register 2-3 tracks max where requirements genuinely hold.

## Okunamadı (unreadable / not retrieved)
- https://x.com/NearBuilders/status/2120390182033645642 ("How to win the NEAR Hackathon in 3 days") - HTTP 402
- https://zypherpunk-results.pages.dev/project/zolanear-shadelink-9c31 - connection refused
- https://redacted.devpost.com and https://nearcon-irl-hackathon.devpost.com/ - 403
- https://nearcon.org/the-agent-hackathon/ - 404; https://dorahacks.io/hackathon/agents-without-masters/prizes - 405
- https://near.foundation/blog/near-at-ethdenver-hackathon-bounty-winners/ - 404
- pages.near.org/?p=21705, 21630, 21104, 21306 (redirect to docs.near.org, content not fetched): SF hackathon, Coinbase Onchain AI, NEARCON IRL 2023 winners, Korea BUIDL Week
- Zcash x NEAR Intents winners (taikai); ETHGlobal Singapore NEAR prize page; Redacted 2024 winners; NEARCON 2026 Agent Wars winners; NEARCON IRL 2024 winners: not retrieved
- GitHub API: further keyword counts blocked by rate limit (403); only the first ~19 of 529 repos inspected
- Real-time X/#NEARHackathon posts: no direct X search possible

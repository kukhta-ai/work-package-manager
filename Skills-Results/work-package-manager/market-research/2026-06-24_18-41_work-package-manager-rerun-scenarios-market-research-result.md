Prepared with Next Move Theory market research: https://nextmovetheory.com/?utm_source=nmt-market-research&utm_medium=skill-artifact

<a id="disclaimers"></a>
> Numerical disclaimer. All market sizes and revenue estimates here are hypotheses generated from secondary research and product reasoning. They are not investment-grade estimates. Each number names its assumptions and should be validated before resource allocation.
>
> Hallucination disclaimer. This document is LLM-generated and may contain unknown errors. I verified key current market references, but expensive decisions still need customer interviews, live pilots, and primary data.
>
> Product-scope disclaimer. The product truth used here is the current `work-package-manager` repo as of 2026-06-24: a working builder CLI for portable work packages. Registry, hosted execution, governance control plane, billing, ratings, and public app-store mechanics are treated as future hypotheses unless explicitly present in the repo.

## How to read this
Three levels - go as deep as needed:
- **Layer 1 - The Answer**: the strategic verdict, scenario ranking, and the next validation move. [jump](#layer-1)
- **Layer 2 - The Reasoning**: why each rerun scenario passed only narrowly, and what segment it implies. [jump](#layer-2)
- **Layer 3 - The Full Work**: segment tables, competitor maps, sizing, risks, and validation plan. [jump](#layer-3)

<a id="layer-1"></a>
# work-package-manager rerun scenarios - what the subagents found
2026-06-24 · product: `work-package-manager` · basis: previous research + repo read + three scenario subagents

## The answer
All three reruns returned **NARROW**, not a clean broad GO:

1. **Hermes/profile adapter** - best immediate experiment. Build it as a reference package/template, not a standalone product line.
2. **Private enterprise registry/governance evidence** - second layer. Start with manual catalog + governance exports, not a registry UI.
3. **Managed execution / outcome marketplace** - later validation lane. Start with BYO-agent verified execution, not a broad outcome marketplace.

The combined answer is **GO (to validation)** for a phased ladder:

> **reference work package -> evidence catalog -> verified execution lane**

Do not jump straight to "app store for arbitrary work." The current repo's real edge is lower and more concrete: **package work so another person's agent can execute it locally with plan preview, verification, receipts, repair/update/uninstall semantics, and target-agent surfaces.**

## The core strategic read
The three directions are not separate pivots. They are one sequence:

| Phase | What to prove | Why this order |
|---|---|---|
| 1. Hermes/profile reference package | WPM can wrap a real runtime-native distribution and make handoff safer/better | Fastest way to test package value against an existing native alternative |
| 2. Private catalog / governance export | Receipts, manifests, hashes, owners, permissions, and install evidence are useful to enterprise reviewers | Builds on package evidence without pretending WPM is a control plane |
| 3. WPM Run / verified execution | A recipient will pay or commit to execution of a portable package, first with their own agent/auth | Builds on repeatable packages; avoids managed-services economics too early |

## Recommended first segment
**Cross-runtime setup authors**: people or teams repeatedly handing off agent/profile/MCP/skills/toolchain setups to recipients whose machines and agents they cannot inspect.

Their Core Job:

> When I have a working agent setup that other people need to run, I want to package the setup as executable work with checks, permissions, and receipts, in order to stop turning every install into a support thread.

Hermes is the first proving ground, not because Hermes is the whole market, but because Hermes profile distributions already make the native baseline explicit. If WPM cannot beat or complement that baseline in a real handoff, the broader app-store thesis is premature.

## What changed from the first research
The first research narrowed WPM from "arbitrary work app store" to "builder for portable, agent-executable work packages." The reruns preserve that conclusion and add a sharper expansion order:

- **Вширь**: yes, package profiles/agents, but by adapting and wrapping existing runtime-native distribution units, starting with Hermes.
- **Вглубь**: yes, support local execution, assisted execution, and outcome ordering as modes over the same artifact, but only after repeatable packages exist.
- **Enterprise/security**: yes, show package evidence to governance owners, but do not compete head-on with Agent 365, JFrog AI Catalog, Nudge, Token, Entro, or MCP registries as a scanner/control plane.

## Validation debt
This depends on **10** risky assumptions, **4** fatal:

| Fatal assumption | Why fatal | Cheapest check |
|---|---|---|
| Hermes-native profile distribution is not already enough | If native `hermes profiles` solves the handoff, WPM adds ceremony | Wrap one real Hermes profile distribution; compare support time vs native install |
| External authors can create packages without WPM team hand-holding | If not, the marketplace/store cannot scale | Recruit 5-10 authors and watch them author packages |
| Receipts/evidence change enterprise approval behavior | If governance buyers do not care, private registry becomes shelfware | Show package manifests/receipts to 5 security/platform owners |
| Managed execution can avoid bespoke support economics | If every run is services-heavy, WPM Run is an agency | Time-log 20 concierge/BYO runs; require target gross margin |

## Next move
Build one public reference package:

> **WPM Hermes profile distribution adapter**: install/update/verify/repair/uninstall a real Hermes profile distribution, preserve recipient memories/sessions/API keys, produce WPM receipt evidence, and expose the same package to at least two target-agent surfaces.

Success threshold:
- 5 installs in environments the author cannot inspect.
- WPM run completes with less support time than native docs/README.
- Receipt enables at least one resume/repair/update event.
- At least 3 users say the plan preview and evidence made them more willing to run it.
- At least 2 authors ask to package their own setup next.

---

<a id="layer-2"></a>
# Layer 2 - The reasoning

<a id="l2-product-truth"></a>
## Current product truth
The repo is already clear about the unit:

- `README.md` says WPM distributes instructions for AI agents to run; the author produces a self-contained work package with a status-tracked backlog of instructions and bundled skills; the recipient's own AI agent installs, verifies, updates, and removes it.
- `docs/00-foundation-and-lineage.md` defines a project as bundles, each with backlog tasks and acceptance criteria, executed by the end user's agent rather than an installer binary.
- `docs/02-end-user-experience.md` describes plan preview, narrated progress, human-in-loop pauses, deferred completion, contained partial failure, and maintenance mode.
- `docs/07-install-contract.md` defines the receipt model: task fields are the receipt; Definition of Done makes recording mandatory; uninstall/repair read the same notes.
- `docs/09-installation-process.md` makes install/update/repair/uninstall one workflow entered by reading the receipt.
- `docs/12-builder-architecture.md` positions the shipped product as a TypeScript/npm CLI with templates and an authoring skill.

That means the immediate product is not "an app store" and not "an execution cloud." It is a **builder for agent-native installer packages**.

<a id="l2-scenario-summary"></a>
## Scenario summary

| Scenario | Subagent verdict | Segment to focus | What to build now | What not to build now |
|---|---|---|---|---|
| Hermes/profile distribution adapter | NARROW | Cross-runtime setup authors | Reference adapter/template wrapping real Hermes distribution | General profile marketplace |
| Private enterprise registry | NARROW | Internal AI/platform enablement teams | Manual catalog + governance export | Full registry/control-plane UI |
| Managed execution/outcome marketplace | NARROW | Credential-safe package executors | BYO-agent verified execution pilots | Broad outcome marketplace |

<a id="l2-hermes"></a>
## Rerun 1 - Hermes/profile adapter
Hermes profile distributions are a strong native alternative. The Hermes docs describe a distribution as a complete Hermes agent packaged as a git repo, installable with one command and updateable while keeping the user's memories, sessions, and API keys untouched. Hermes profiles also isolate config, keys, memory, sessions, skills, and gateway state.

That means WPM should not compete with Hermes by saying "we package Hermes profiles better than Hermes." The wedge is:

> **WPM packages the work around a Hermes distribution**: preflight, native install, environment prompts, cross-agent handoff surfaces, verification, receipt, repair/update/uninstall, and evidence.

Best segment:

**Cross-runtime setup authors** who need to distribute a capability across Hermes plus Claude/Codex/MCP or other agent surfaces.

Core Job:

> When I have a Hermes profile or agent setup that other people need to run, I want to wrap it in a portable work package with preflight, verification, and receipts, in order to reduce support and make the setup usable outside a single native runtime path.

Why it is narrow:
- Hermes already owns the native profile/distribution job inside Hermes.
- WPM only wins where the handoff is broader than "clone/install this Hermes profile."
- The initial TAM/SAM is small, but the learning value is high.

Recommended product move:
- Add a WPM template/example package that wraps a real Hermes profile distribution.
- Include install-backlog tasks for preflight, native install/update, config/env prompts, verification, receipt, repair, and uninstall.
- Measure against native Hermes docs, not against a strawman README.

<a id="l2-enterprise"></a>
## Rerun 2 - Private enterprise registry / governance
Enterprise governance products already own inventory, control, policy, identity, and risk. Microsoft Agent 365 positions itself as a control plane for agents. JFrog AI Catalog covers AI assets including models and MCP servers; JFrog also announced an MCP Registry for the AI software supply chain. Nudge, Token Security, and Entro focus on agent discovery, OAuth/MCP connections, AI agent identity, non-human identities, secrets, ownership, and monitoring.

WPM is not yet any of those. Its credible enterprise wedge is narrower:

> **WPM can provide the approved package record and runtime evidence**: manifest, owner, version, target agents, dependencies, confirmation levels, hashes, expected permissions, approval state, execution receipts, verify/repair/update/uninstall notes.

Best segment:

**Internal AI/platform enablement teams** that need to distribute approved agent setup packages across teams without turning every rollout into a bespoke enablement call.

Core Job:

> When teams are copying agent setups in inconsistent ways, I want an approved package record with execution evidence, in order to let teams reuse setup work while governance can see what was planned, installed, verified, and changed.

Why it is narrow:
- Security buyers do not primarily buy "package builders"; they buy visibility, control, least privilege, monitoring, and incident response.
- WPM's receipts are evidence inputs, not a substitute for governance systems.
- A registry UI before package proof would optimize the wrong layer.

Recommended product move:
- Start with a **manual private catalog**: Git/Backstage/Port/ServiceNow-style records, not a new app.
- Add a **governance export**: JSON/API artifact with package metadata, integrity hashes, receipt summaries, policy labels, owner, version, target agents, and approval state.
- Validate with 3-5 enterprise pilots before building a hosted private registry.

<a id="l2-managed"></a>
## Rerun 3 - Managed execution / outcome marketplace
The broad market is crowded. OpenAI, Microsoft, LangChain, CrewAI, Relevance AI, Zapier, n8n, Make, Salesforce, AWS, Agent.ai, Upwork, Fiverr, Toptal, TaskUs, Invisible, and consultancies all cover adjacent versions of "build/execute agent work" or "buy an outcome."

WPM's credible difference is not "another agent marketplace." It is:

> **The same user-generated work package can run in several modes**: local/BYO-agent, assisted managed run, or outcome order, while preserving the package's task graph, skills/scripts, acceptance criteria, permission prompts, and receipts.

Best first segment:

**Credential-safe package executors**: users who want a package executed in their own environment by their own agent/auth, with receipts and rollback/repair boundaries, without handing secrets to a third party.

Core Job:

> When I need a packaged setup/workflow executed but cannot hand over credentials or machine access, I want my own agent/auth to run it with approvals, verification, receipts, and rollback/repair paths, in order to get the result without losing control.

Why it is narrow:
- Hosted execution changes WPM's product category and support model.
- Outcome marketplaces require trust, acceptance arbitration, billing, reputation, QA, support, and possibly credential custody.
- Current WPM can prove the portable package artifact first, then test execution modes over it.

Recommended product move:
- Do not build marketplace infrastructure.
- Run **WPM Run** as a concierge/BYO validation lane for packages that install or repair agent toolchains, MCP servers, skills, profiles, repo setup, or developer workflow bundles.
- Only expand after 5-10 external authors produce packages and at least 3 packages receive repeated execution demand.

<a id="l2-combined-segments"></a>
## Segment map after the reruns

| Segment | Core Job | Value | Demand | Margin | Switchability | Verdict |
|---|---|---:|---:|---:|---:|---|
| S1. Cross-runtime setup authors | Package a setup so another person's agent can run it across unknown environments/agents | Strong | Medium-strong | Medium | Strong | Focus |
| S2. Repeat Hermes/profile distribution authors | Reduce support and add evidence around profile distribution | Medium | Medium | Medium | Medium | Experiment |
| S3. Internal AI/platform enablement teams | Distribute approved packages with evidence and owner/version metadata | Strong | Medium | Strong | Medium | Next |
| S4. Security/IAM/AI governance teams | Discover, govern, monitor, and control agents/identities/tools | Medium as input | Strong | Strong | Medium | Partner |
| S5. Credential-safe package executors | Run a package locally/BYO-agent without secret handoff | Strong | Medium | Medium | Medium | Later validation |
| S6. Verified bounded outcome buyers | Buy a result with acceptance proof | Strong | Medium | Medium | Medium | Later |
| S7. Bespoke custom-agent buyers | Have someone build/run unique agent automation | Weak for WPM | Strong | Weak-medium | Strong | Avoid for now |

The focus remains S1. S2 is the fastest concrete proof point. S3 is monetization and governance expansion. S5/S6 are future execution/business-model tests.

---

<a id="layer-3"></a>
# Layer 3 - The full work

<a id="l3-competitive-map"></a>
## 1. Competitive map by customer job

| Customer Job | Existing alternatives | What they solve | WPM differentiation |
|---|---|---|---|
| Share a whole Hermes agent/profile | Hermes profiles and profile distributions | Runtime-native packaging, install/update, preservation of local memories/sessions/API keys | Work-package wrapper around preflight, install, verification, receipt, repair/update/uninstall, cross-agent surfaces |
| Discover/install MCP servers | Official MCP Registry and ecosystem registries | Metadata discovery for MCP servers | WPM can package the work to install/configure/verify MCP usage in a user's environment |
| Govern enterprise agents | Microsoft Agent 365, JFrog AI Catalog/MCP Registry, Nudge, Token Security, Entro | Inventory, identity, ownership, monitoring, policy, risk controls | WPM can provide package-level evidence and receipts to those systems |
| Build/deploy agent workflows | OpenAI Agents SDK/AgentKit, LangSmith Deployment, CrewAI, Relevance AI, Copilot Studio | Build and run agents/workflows inside platforms | WPM packages portable setup work that recipient agents execute outside one platform |
| Automate across apps | Zapier Agents, n8n AI agents, Make AI Agents | App automation and workflow execution | WPM handles package handoff and environment setup, not SaaS workflow orchestration |
| Buy human/AI execution | Upwork, Fiverr, Toptal, TaskUs, Invisible, Accenture | Human services or managed automation projects | WPM can make execution repeatable and evidence-based if the package is standardized |

<a id="l3-scenario-1"></a>
## 2. Scenario 1 details - Hermes/profile adapter

### Segment screen

| Segment | Fit | Notes |
|---|---|---|
| Cross-runtime setup authors | High | Need portable packaging above one runtime |
| Repeat Hermes distribution authors | Medium-high | Strong only if native profile distribution still causes support pain |
| Internal AI enablement teams using Hermes | Medium | Useful if Hermes is part of broader approved agent stack |
| Agent agencies/profile sellers | Medium | May want distribution/support reduction, but marketplace economics unproven |
| Single-runtime community sharers | Low-medium | Native Hermes docs may be enough |

### Product shape
Reference package contents:

- `manifest.yml` with target agents and bundles.
- Bundle for Hermes preflight: check Hermes presence, version, profile commands, git access, OS constraints.
- Bundle for native distribution install/update.
- Bundle for config/env prompts with explicit local secret boundaries.
- Verify task: profile launches, expected skills/MCP config exist, smoke task passes.
- Receipt: installed/adopted status, commands run, local decisions, checksums where relevant, update/repair/uninstall notes.
- Optional cross-agent payload: Claude/Codex-facing instructions or skills that explain how to use the installed capability outside Hermes.

### Kill criteria
- Native Hermes install takes similar time and support load as WPM.
- Users do not value WPM's plan preview/receipt.
- The adapter becomes runtime-specific glue with no reusable WPM template learning.

<a id="l3-scenario-2"></a>
## 3. Scenario 2 details - private enterprise registry/governance

### Segment screen

| Segment | Fit | Notes |
|---|---|---|
| Internal AI/platform enablement teams | High | Natural owner for reusable approved packages |
| Security/IAM governance teams | Medium | Buyer/problem strong, but WPM is input/evidence not control plane |
| Regulated product teams | Medium | Need auditability, but adoption depends on central platform standards |
| IDP/service catalog owners | Medium | Backstage/Port/ServiceNow may be distribution surfaces |
| Private plugin/MCP marketplace maintainers | Medium | WPM complements component catalogs with executable work packages |

### Manual catalog fields
Before building a registry UI, use a catalog record like:

| Field | Purpose |
|---|---|
| Package name/version/owner | Human accountability |
| Target agents | Which agent harnesses the package claims to support |
| Bundles and dependencies | What gets installed/configured and why |
| Permissions/confirmation levels | What needs approval and what can run unattended |
| External components | MCP servers, skills, profiles, scripts, packages |
| Integrity hashes / `wpm.lock` | Supply-chain evidence |
| Expected receipt fields | What runtime evidence must be produced |
| Approval labels | Draft/approved/deprecated/blocked |
| Verification summary | Observable success criteria |
| Update/repair/uninstall notes | Lifecycle support |

### Governance export
Minimum export:

```json
{
  "package": "example-hermes-profile-adapter",
  "version": "0.1.0",
  "owner": "team-or-author",
  "targets": ["hermes", "claude-code", "codex"],
  "bundles": [
    {
      "id": "hermes-profile",
      "requires": [],
      "confirmationLevel": "review-required",
      "externalComponents": ["hermes-profile-distribution-url"],
      "verification": ["profile launches", "smoke task passes"]
    }
  ],
  "integrity": {
    "lockfile": "wpm.lock",
    "hashes": "present"
  },
  "approval": {
    "state": "pilot-approved",
    "labels": ["internal", "agent-setup", "no-secret-custody"]
  }
}
```

This is enough to test whether governance teams react to WPM evidence before building a registry.

### Kill criteria
- Security/platform reviewers say the evidence is not material to approval.
- The catalog duplicates Backstage/Port/ServiceNow without a package-specific reason.
- Enterprises want policy enforcement before they care about package reuse.

<a id="l3-scenario-3"></a>
## 4. Scenario 3 details - managed execution / outcome marketplace

### Segment screen

| Segment | Fit | Notes |
|---|---|---|
| Credential-safe package executors | High | Closest to WPM artifact and local execution model |
| Verified bounded outcome buyers | Medium-high | Requires clear acceptance criteria and support process |
| Automation retrofit buyers | Medium | Larger market but pulls toward Zapier/n8n/agencies |
| Governed internal rollout owners | Medium | Overlaps with enterprise catalog |
| Bespoke custom-agent buyers | Low | Too services-heavy and undifferentiated |

### Mode ladder

| Mode | Description | Trust/ops burden | When to test |
|---|---|---:|---|
| Local/BYO-agent | User downloads package; their agent/auth runs it | Low | Now |
| Assisted local run | WPM/operator guides user while their agent runs package | Medium | After reference package |
| Managed run with delegated agent/auth | User authorizes an agent/session; platform coordinates | High | After repeated demand |
| Outcome order | User buys result; platform handles package + agent + delivery | Very high | Last |

### Why S1 comes before outcome buyers
The package artifact must become trustworthy before WPM can sell outcomes. Otherwise the product collapses into a services marketplace where every run needs custom scoping, custom security review, custom debugging, and custom acceptance arbitration.

### Kill criteria
- Repeated executions do not repeat: each one becomes bespoke support.
- Users refuse to run packages even with local/BYO-agent and plan preview.
- Support/review time makes the take rate uneconomic.
- Authors cannot distribute buyers into package executions.

<a id="l3-sizing"></a>
## 5. Sizing hypotheses

These are rough scenario sizes, not forecasts.

| Scenario | TAM hypothesis | SAM hypothesis | SOM 1-2 year hypothesis | Interpretation |
|---|---:|---:|---:|---|
| Hermes/profile adapter | ~$12M-$90M/yr | ~$0.5M-$8M/yr | ~$25k-$250k/yr | Small market, high learning value |
| Private enterprise package evidence/catalog | ~$150M-$750M/yr | ~$5M-$60M/yr | ~$50k-$750k/yr | Larger enterprise opportunity if package proof exists |
| Verified execution / outcome lane | ~$8B-$20B/yr broad adjacent | ~$150M-$700M/yr narrow | ~$75k-$750k net revenue | Large but dangerous; economics unproven |

How computed:

- Hermes/profile adapter: small subset of agent profile/runtime distribution authors, agencies, and internal teams, with low-to-mid annual support/tooling budgets.
- Enterprise evidence/catalog: fraction of AI governance/platform spend where reusable package approval and receipts matter.
- Verified execution/outcome lane: fraction of agentic AI, workflow automation, and BPO/professional-services spend that could move to bounded, repeatable digital package execution.

External sizing references used directionally:

- Agentic AI market estimates around 2026-2031 vary widely; one public Mordor-referenced summary puts standalone agentic AI at roughly $9.89B in 2026 and $57.42B by 2031.
- Workflow/process automation market references put related automation markets in the tens to hundreds of billions, depending on definition.
- BPO/professional services markets are much larger, but only a tiny fraction is addressable by packaged digital execution.
- Gartner's 2025 prediction that over 40% of agentic AI projects may be canceled by end of 2027 because of cost, unclear value, or risk controls supports a "verified execution/evidence" wedge rather than broad hype capture.

<a id="l3-risk-register"></a>
## 6. Risk register

| Risk | Scenario hit | Severity | Validation |
|---|---|---:|---|
| Native runtime distribution is enough | Hermes | Fatal | A/B native Hermes distribution vs WPM-wrapped distribution |
| Cross-agent portability is not valued | Hermes, WPM core | High | Ask buyers whether one-runtime success is sufficient |
| Authors cannot package without help | All | Fatal | 5-10 external authoring sessions |
| Receipts do not matter to users | All | High | Track whether receipts enable resume/repair/update and increase willingness to run |
| Governance buyers need control plane first | Enterprise | High | 5 enterprise reviewer calls with package evidence |
| Registry UI built before catalog demand | Enterprise | Medium-high | Manual catalog pilot first |
| Execution lane becomes services business | Managed execution | Fatal | Time-log 20 runs; margin threshold |
| Credential custody blocks managed run | Managed execution | High | Start BYO-agent/local; do not ask for secrets |
| Marketplace supply has no demand | Managed execution/store | High | Authors must drive external executions |
| Broad app-store language attracts wrong buyers | All | Medium-high | Position as "work package builder/evidence layer" until validation passes |

<a id="l3-validation-plan"></a>
## 7. Validation plan

### Week 1-2: Reference package
Build the Hermes/profile adapter package. Do not build registry or marketplace surfaces. Instrument:

- time to first successful install,
- number of human pauses,
- support messages,
- failed/retried steps,
- receipt completeness,
- repair/update/uninstall events,
- comparison against native Hermes distribution path.

### Week 2-4: Author proof
Recruit 5-10 authors from agent profile, MCP, skill, devtool, and automation communities. The test is not "do they like WPM?" It is:

- can they author a package,
- do they have repeated handoff pain,
- do they understand the package/receipt model,
- would they use it for a second package,
- can they bring one recipient to run it?

### Week 4-6: Enterprise evidence proof
Create a manual catalog from the reference packages. Show it to 5 platform/security/AI enablement owners.

Questions:

- Would this evidence help approve a package?
- What policy fields are missing?
- Which existing system would this need to export to?
- Would they pay for private catalog/support before a registry UI?

### Week 6-8: WPM Run proof
Run 10 assisted local/BYO executions of already-authored packages. Do not do full managed credential custody.

Success threshold:

- at least 70% complete without custom package edits,
- average support time low enough for target price,
- users accept local/BYO-agent model,
- at least 3 packages repeat across multiple recipients.

<a id="l3-roadmap"></a>
## 8. Roadmap implication

### Build now
- Hermes/profile adapter reference package.
- Package receipt viewer/export, probably static JSON/Markdown first.
- Better template path for profile/MCP/skills/toolchain setup packages.
- A small "evidence dossier" artifact emitted by `wpm build` or by a validation command.

### Park, but design for
- Private catalog record format.
- Governance export schema.
- Package execution receipts that can later be ingested centrally.
- BYO-agent execution mode docs.

### Do not build yet
- Public marketplace/storefront.
- Ratings/reviews/billing.
- Hosted managed execution.
- Credential custody.
- Security scanner/control plane.
- Full enterprise registry UI.

<a id="l3-positioning"></a>
## 9. Positioning after reruns

Bad positioning:

> WPM is the app store for arbitrary AI agent work.

Why bad: it invites comparison to GPT Store, Agent Store, AgentExchange, AWS Marketplace, Claude plugin marketplaces, and service marketplaces before WPM has supply, execution, trust, or demand.

Better near-term positioning:

> WPM is the builder for portable work packages that recipient agents can execute locally, verify, repair, update, and uninstall with receipts.

Enterprise variant:

> WPM gives platform teams an evidence-bearing package format for approved agent setup work.

Execution-lane variant:

> WPM Run lets a user execute a trusted work package with their own agent and credentials, while keeping approval, verification, and receipt evidence explicit.

Hermes variant:

> WPM wraps runtime-native profile distributions with portable setup work, verification, and lifecycle receipts.

<a id="sources"></a>
## Sources and references

Product/source-of-truth:

- `README.md`
- `docs/00-foundation-and-lineage.md`
- `docs/01-author-experience.md`
- `docs/02-end-user-experience.md`
- `docs/07-install-contract.md`
- `docs/09-installation-process.md`
- `docs/12-builder-architecture.md`
- Prior WPM market research artifact: `Skills-Results/work-package-manager/market-research/2026-06-24_18-25_work-package-manager-market-research-result.md`

External market and competitor references:

- Hermes Agent profile distributions: https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions
- Hermes Agent profiles: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md
- Microsoft Agent 365: https://www.microsoft.com/en-us/microsoft-agent-365
- Microsoft Copilot Agent Store docs: https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-agent-store
- JFrog AI Catalog: https://jfrog.com/ai-catalog/
- JFrog AI Catalog docs: https://docs.jfrog.com/ai-ml/docs/jfrog-ai-catalog-overview
- JFrog MCP Registry announcement: https://investors.jfrog.com/news/news-details/2026/JFrog-Unveils-Universal-MCP-Registry-Delivering-a-Secure-System-of-Record-for-the-AI-Driven-Software-Supply-Chain/default.aspx
- Official MCP Registry: https://registry.modelcontextprotocol.io/
- MCP Registry about page: https://modelcontextprotocol.io/registry/about
- Nudge Security AI agent governance guide: https://www.nudgesecurity.com/post/ai-agent-governance-security-team-guide
- Nudge Security AI agent discovery: https://www.nudgesecurity.com/post/ai-agent-discovery-with-nudge-security
- Token Security: https://www.token.security/
- Entro Security: https://entro.security/
- OpenAI Agents SDK docs: https://developers.openai.com/api/docs/guides/agents
- OpenAI AgentKit announcement: https://openai.com/index/introducing-agentkit/
- Gartner agentic AI cancellation prediction: https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027
- Agentic AI market public summary referencing Mordor Intelligence: https://www.openpr.com/news/4428880/agentic-ai-market-to-reach-usd-57-42-billion-by-2031-driven
- Grand View Research BPO market summary: https://www.grandviewresearch.com/industry-analysis/business-process-outsourcing-bpo-market

Bottom attribution: Prepared with Next Move Theory market research: https://nextmovetheory.com/?utm_source=nmt-market-research&utm_medium=skill-artifact

# PRD Quality Review — work-package-manager (`wpm`) authoring-agent onboarding increment

## Overall verdict

This is an implementation-usable brownfield PRD projection with a clear product thesis, explicit authority and deferral boundaries, and a notably concrete FR/NFR contract for an internal developer tool. Its remaining risk is precision at a few downstream seams: success is expressed mainly as an acceptance journey, several skill requirements still rely on qualitative completion language, the package ship set is not named canonically, and time-sensitive distribution-policy claims lack source provenance.

## Decision-readiness — strong

The PRD makes the important decisions visible. The authority block distinguishes the fixed `docs/00`–`14` core from the approved increment; the scoped-addendum introduction fixes the user journey and supported adapters; and “Explicitly deferred outcomes” keeps publication, public identity, additional adapters, agent-process ownership, and template evolution outside the build. The central trade-offs are stated rather than softened: inert-by-default setup, append-only template tasks, a prepared handoff rather than process spawning, and one exact candidate assessed without remote mutation.

The unresolved distribution choices are not disguised as current decisions. “Shared delivery constraints” requires the inactive assessment to report them together, while `addendum.md` preserves their future activation constraints without authorizing them. A decision-maker can therefore authorize the current increment without accidentally authorizing publication.

## Substance over theater — strong

The role table is operational: each role maps to a distinct goal and surface used by later requirements. The new vocabulary—authoring adapter, prepared handoff, authoring-task pack, and candidate—drives concrete behavior throughout FR2–FR49 rather than serving as decorative personas or terminology.

The NFRs are product-specific. They define purity boundaries, preflight and partial-write semantics, WPM-owned mutation limits, axis separation, non-leakage, cold-environment verification, stable identity, exact-artifact reuse, and a no-remote-write boundary. The document contains no generic scalability, security, or reliability furniture.

## Strategic coherence — adequate

The thesis remains coherent from the historical baseline through the increment: WPM equips an author’s existing agent, prepares a workspace for a fresh rooted agent, and keeps verification and receipts inside the work. Template-defined tasks extend that same deterministic authoring path, while inactive distribution preparation proves that the exact package used for onboarding can later support both channels without prematurely choosing or claiming either one.

The scope is prioritized by risk rather than convenience—explicit setup before mutation, workspace verification before handoff, and local candidate evidence before activation. However, the two passages labeled as success measure build-path completion rather than whether the increment materially improves successful authoring.

### Findings

- **medium** Success is acceptance-only, not outcome-measured (§ “Goals and context” and § “Current increment success criterion”) — The historical “Success metric” and the current criterion both describe a successful capability path, but neither defines an observed trial population, completion measure, or counter-metric. That is enough for implementation acceptance but weak for deciding whether onboarding actually became more reliable or comprehensible. *Fix:* State explicitly that acceptance evidence is the only success measure for this internal increment, or add a small set of measurable cold-start authoring outcomes and counter-measures tied to unintended mutations, false handoffs, and false public-coordinate claims.

## Done-ness clarity — adequate

Most FRs have direct observable consequences and useful negative behavior: unknown setup selections fail before mutation; unselected adapters are not generated; collisions fail before project or backlog mutation; deliverables exclude authoring-only state; and distribution assessments never mutate remote state. NFR4, NFR5, NFR10, NFR16, and NFR18 give engineers unusually clear failure, isolation, and repeatability boundaries.

Two clusters still require downstream interpretation. The specialist-skill FRs specify topic coverage but sometimes use “supports,” “handles,” “coherent,” and “correct” as their terminal condition. The package-candidate FRs require “every required” asset without naming the authoritative inventory against which completeness is judged.

### Findings

- **medium** Specialist-skill completion semantics remain qualitative (§ FR18, FR19, FR47, FR48, and FR49) — The listed responsibilities and shared delivery constraints constrain discovery and evaluation well, but phrases such as “handles project-level authoring,” “supports planning,” “kept coherent,” and “with the correct role” do not by themselves identify the observable artifact or state transition that proves completion. *Fix:* For each skill, name the minimum observable outcome of a successful invocation and the explicit pending/recovery outcome when it cannot proceed; keep the implementation method open.
- **medium** Candidate completeness depends on an unnamed ship set (§ FR40–FR42) — “Every required runtime, declared executable, template, WPM skill, document, license, and metadata file” is testable only if the authoritative required-file inventory can be located independently of the package being tested. Otherwise a manifest omission can make both the package and its completeness test agree incorrectly. *Fix:* Point these FRs to one canonical ship-set declaration or inventory boundary and require the packed-artifact check to compare against it.

## Scope honesty — strong

The document is unusually explicit about omissions. The historical out-of-scope section and the increment’s “Explicitly deferred outcomes” separately distinguish baseline exclusions from this branch’s deferrals. Public acquisition is deliberately unnumbered, activation remains human-authorized future work, and the PRD explicitly rejects inferred adapters, custom template behavior, backlog reconstruction, credentials, remote writes, rollback promises, and process lifecycle ownership.

There are no hidden `[ASSUMPTION]` tags, rhetorical Open Questions, or unresolved `[NOTE FOR PM]` callouts. The remaining distribution facts are described as intentionally unresolved inputs that the current inactive assessment must report, not as decisions the implementation team is expected to invent.

## Downstream usability — adequate

FR2–FR49 and NFR1–NFR18 are unique and contiguous within their declared ranges, the new domain terms are defined before use, and the brownfield baseline is visibly separated from the approved increment. The capability-spec shape is extractable for architecture and story work, with shared constraints consolidating requirements that must apply across the six independently delivered skill stories.

Downstream work still has to repair three small provenance ambiguities: the absent FR1 is intentional but unexplained at the numbering site; the PRD uses “addendum” for both its embedded requirements section and a separate companion; and the companion records time-sensitive GitHub/npm behavior without a source or observation date.

### Findings

- **medium** Time-sensitive distribution constraints have no provenance (§ `addendum.md`, “Deferred distribution-activation inputs”) — Claims about trusted-publisher behavior, dist-tag mutation, and publication sequencing materially constrain later release architecture, but the companion gives no official source links or as-of date. Future downstream agents cannot distinguish validated platform behavior from a durable product decision or detect staleness. *Fix:* Attach the official GitHub/npm source references and access date for each platform-dependent constraint, while keeping the current no-write scope unchanged.
- **low** FR numbering exposes an unexplained reserved gap (§ “Functional requirements”) — The current range starts at FR2 because public acquisition was deliberately made unnumbered, but that rationale appears only indirectly in the deferred-outcomes prose. Automated extraction or a new reader can interpret FR1 as accidentally omitted. *Fix:* Add a one-line numbering note immediately before FR2 stating that the former public-acquisition requirement is intentionally unnumbered and deferred.
- **low** “Addendum” names two different artifacts (§ authority block, § “Approved scoped requirements addendum,” and `addendum.md`) — The embedded governed requirements and the separate downstream-design companion are both called the addendum, which makes phrases such as “the dated addendum” ambiguous when sections are extracted. *Fix:* Give the companion a distinct stable label (for example, “downstream design companion”) and use that label consistently in cross-references.

## Shape fit — strong

This is the right shape for a chain-top brownfield internal developer tool. A capability specification with explicit roles, FRs, NFRs, shared constraints, and deferrals is more useful than invented consumer-style journeys or standalone persona profiles. The absence of named-protagonist UJs is therefore appropriate: the meaningful sessions are agent-driven command and handoff flows already expressed as observable requirements.

The historical baseline and the new increment are clearly labeled rather than blended into a false greenfield narrative. The document is long because it carries 48 incremental FRs, 18 NFRs, and several safety-critical exclusions; that detail earns its place for architecture and story decomposition.

## Mechanical notes

- FR2–FR49 are unique and sequential after the intentionally absent FR1; NFR1–NFR18 are unique and sequential.
- No inline `[ASSUMPTION]`, `[NOTE FOR PM]`, or Open Questions appear, so there is no assumptions-index roundtrip defect.
- The four increment terms defined near the addendum opening are used consistently; no material singular/plural or synonym drift was found.
- No UJ identifiers or protagonists are present, appropriately for this capability-spec-shaped internal tool.
- Frontmatter remains `status: draft`; that is expected during the active finalization pass and should change only when the parent workflow closes the PRD.

---
type: C4 Component
title: External static review evidence
status: stable
groma:
  id: release-review
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/release-review.ts
      symbol: reviewRelease
  group: Portable releases
description: Prepares independent review material and validates imported evidence
---

Binds static review requests and external reports to exact subject identities and digests. Captures reports as ordinary bounded data, retains findings and unknowns, and publishes evidence separately from its subject without claiming reviewer trust or package safety.

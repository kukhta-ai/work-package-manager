---
id: TASK-13
title: Implement comment-preserving YAML
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 23:31'
labels: []
dependencies:
  - TASK-12
ordinal: 13000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A configuration file edited programmatically keeps its comments and key order; only the intended change differs (doc 12)
- [x] #2 A file read and written back without changes is byte-for-byte identical
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
comment-preserving YAML leaf src/util/yaml.ts (pure, I/O-free, wraps yaml@2.9.0): parseYaml/stringifyYaml (fresh writes, drop comments) + parseDocument/stringifyDocument + editYaml (comment-preserving edit via eemeli Document/setIn). THE SEAM that makes task-11's lossy serialize safe: fresh files use stringifyYaml; mutating an author-edited file uses editYaml so comments/blank-lines/key-order/unknown-keys survive (module JSDoc documents the two-path contrast). AC#1: editing one value keeps comments (content+order)+key-order+unknown-keys. AC#2: parseDocument(text).toString()===text byte-for-byte for the CANONICAL 2-space-block + single-space-inline-comment style the CLI emits and docs/10 uses. REVIEW (rigorous 16-sample probe): dedicated reviewer APPROVE + 1 cycle -- found the initial 'one known normalization' claim incomplete: eemeli/yaml re-emits in its configured style, normalizing NON-canonical input (4-space/0-indent to 2-space; [a,b] to [ a, b ]; multi-space-before-inline-comment to one GLOBALLY on any edit). These are inherent to the doc-12-mandated lib and do not bite canonical config; F1 (honest scoped JSDoc) + F2 (test documenting the global comment re-alignment) applied. FORWARD NOTE (tasks 30/31): author the template manifest.yml/bundle.yml with SINGLE-SPACE inline comments so version-bump edits stay line-local. Gate green (tsc 0 / biome 44 / vitest 163, 12 yaml tests); npm ci clean.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

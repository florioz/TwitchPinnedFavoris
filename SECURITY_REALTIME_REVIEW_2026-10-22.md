# Security and shared chat realtime - 2026-10-22

## Scope
Local dependency audit (npm advisory database), vendor advisory review, shared chat rendering and realtime authorization code. Not a penetration test; production database policies and browser versions were not inspected.

## Dependency findings
- @capacitor/android: critical; patched in the local lockfile.
  - Capacitor Android and iOS: remote content can be loaded at the app origin via the internal HTTP proxy path https://github.com/advisories/GHSA-rvm3-566m-v7fv
- @xmldom/xmldom: high; patched in the local lockfile.
  - xmldom: XML fragment injection via invalid EntityReference.nodeName during requireWellFormed serialization https://github.com/advisories/GHSA-6gmq-8vp8-gcm6
  - xmldom: HTML raw-text closing-tag case mismatch causes output amplification https://github.com/advisories/GHSA-6mj3-qw4j-hgrw
  - xmldom PI grammar regex ReDoS: quadratic backtracking on unterminated processing instructions https://github.com/advisories/GHSA-g53g-w8rj-fmg7
  - xmldom: Element name injection via createElement() bypasses requireWellFormed https://github.com/advisories/GHSA-w2rr-34g9-rvrj
  - xmldom: Attribute name injection via setAttribute() bypasses requireWellFormed https://github.com/advisories/GHSA-4w3w-2rp5-g8jm
  - xmldom: Processing Instruction Target Injection Bypasses requireWellFormed https://github.com/advisories/GHSA-c7q8-3ch8-vqpv
  - xmldom: DocType `name` Injection Bypasses requireWellFormed https://github.com/advisories/GHSA-27p8-2357-5qqv
  - xmldom: Creation-time XML Name/QName validation is bypassable via an embedded line terminator, allowing injection on the default serialization path https://github.com/advisories/GHSA-3px3-54cx-rmw9
  - xmldom: requireWellFormed DocType publicId/systemId validation is bypassable via an embedded line terminator https://github.com/advisories/GHSA-vr34-hp96-76pp
  - xmldom: Parser silently accepts a not-well-formed end tag whose name is followed by a line break and trailing content https://github.com/advisories/GHSA-6h8r-xr42-gp59
  - xmldom: Quadratic-time attribute deduplication https://github.com/advisories/GHSA-8344-3jmq-59r6
  - xmldom: Quadratic-memory consumption https://github.com/advisories/GHSA-965w-775f-mr7g
  - xmldom: Quadratic-time parsing via the malformed-input recovery path — `parseElementStartPart` re-scan and `normalize()` adjacent-text merge https://github.com/advisories/GHSA-93r5-fhx6-vmg9
- brace-expansion: high; patched in the local lockfile.
  - brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups https://github.com/advisories/GHSA-3jxr-9vmj-r5cp
  - brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash https://github.com/advisories/GHSA-mh99-v99m-4gvg
  - brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation https://github.com/advisories/GHSA-rgw5-rvv9-x895
  - brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service https://github.com/advisories/GHSA-q2hr-2g5m-vwhr
  - brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion https://github.com/advisories/GHSA-qhr7-859c-m2p7
  - brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion https://github.com/advisories/GHSA-6j4f-fj2g-mc7p
- tar: critical; patched in the local lockfile.
  - node-tar: Process crash via PAX numeric path type confusion https://github.com/advisories/GHSA-w8wr-v893-vjvp
  - node-tar: Decompression/parse DoS via unlimited input https://github.com/advisories/GHSA-23hp-3jrh-7fpw
  - node-tar: Negative tar entry size causes infinite loop in archive replace https://github.com/advisories/GHSA-8x88-c5mf-7j5w
  - node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records https://github.com/advisories/GHSA-gvwx-54wh-qm9j
  - node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflow DoS via crafted long-path tar with member selection https://github.com/advisories/GHSA-r292-9mhp-454m

Capacitor Android updated from 8.4.0 to 8.4.3. The native companion is affected by the vendor advisory; Chrome/Firefox do not embed the Capacitor Android runtime. Previously distributed APKs are not repaired by source changes. npm audit after updates: zero reported vulnerabilities.

## Realtime implementation
- Private broadcast notifications contain an empty object, never chat text or user credentials.
- Access tokens remain in the background service. Membership is checked by the realtime read policy; message RPCs recheck access on each reload.
- Insert, update, delete and reaction changes trigger invalidations. Bursts coalesce over 150 ms.
- Hidden or collapsed chat disconnects. Reconnect catches up via authenticated RPCs. Heartbeat, token renewal, timeout and exponential reconnect are implemented.
- If realtime is unavailable, visible chat polls every 5 seconds. Connected chat has a 60-second reconciliation interval.
- Shared chat user text is rendered through textContent, not interpolated HTML.

## Deployment still required
Apply supabase/migrations/020_shared_chat_realtime.sql to the existing project using the Supabase SQL Editor. Do NOT rerun setup.sql on an existing project. No production database migration was applied in this session.
Then reload the extension and test two authenticated member accounts plus a non-member: sends, edits, deletes, reactions, hidden/visible, reconnect and revoked membership. Live end-to-end behavior and deployed RLS remain unverified.
No store publication or GitHub release performed.

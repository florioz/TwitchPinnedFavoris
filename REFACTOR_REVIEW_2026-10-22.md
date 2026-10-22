# Refactor review - 2026-10-22

## Scope
Reviewed runtime entry points and file references across src, panel, mobile and scripts; inspected unused method candidates, chat projection, teardown and storage/network lifecycles. This is a targeted refactor after a repository-wide scan, not proof that all dead code or performance problems have been eliminated.

## Changes
- Removed unused favorites store methods: toggleCategoryAssignment, setCategoryParent, toggleLiveFavoritesCollapsed. No runtime callers found, including configured string setters.
- Removed unused getLatestMessage and its redundant recentMessages array and capture path.
- Removed unused removeNativeRecentMessages DOM deletion routine.
- Removed unused DEFAULT_AVATAR in the service worker and DELETED_SELECTOR in the page bridge.
- FavoritesOverlay.destroy delegates to the complete dispose path, including listeners, timers and caches.
- Category suggestion cache bounded to 100 searches.
- Shared chat snapshot indexes edits and reactions once, replacing per-message scans. Metadata projection changes from O(messages * (edits + reactions)) to O(messages + edits + reactions).
- Concurrent session renewals share one in-flight request per refresh token; a regression test covers parallel messages, metadata and realtime requests.
- Firefox source copies synchronized.

## Validation
513 tests passed before the final null guard; focused remote tests rerun after it. JS syntax, Firefox synchronization and Supabase setup checks passed. Chrome and Firefox packages built locally; npm audit reports zero known dependency vulnerabilities.

## Limits and remaining deployment
No multi-hour browser heap/CPU profiling was performed. No production release or store upload. Local dist filenames retain 0.6.29 and are development builds, not the published release. Supabase migration 020 from the previous task still requires deployment and end-to-end private-channel verification. Conflict backup files are excluded by the existing packaging tooling and were preserved rather than deleted as presumed dead source. Git index reports staged deletions with matching working-tree files; no index reset or commit was performed.

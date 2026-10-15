// Runs in the page's MAIN world at document_start (see manifest), so it shares globals with
// the page, not with the other content scripts. The action click re-injects every content
// file, so whatever goes here must guard against running twice. Phase 2 fills it in.

declare const __ATLAS_BUILD_REVISION__: string;

// Vite replaces this at build time. The app must never ask a deployment for git
// state at runtime: a served artifact can outlive its checkout.
export const buildRevision = __ATLAS_BUILD_REVISION__;

/**
 * Setup-side ChannelPlugin — a lighter copy used by the host's setup wizard
 * before the full runtime is loaded. For now it exports the same plugin
 * object as the runtime side; we'll narrow it in Phase 4 if/when we add a
 * setup wizard.
 */
export { blueskyPlugin as blueskySetupPlugin } from "./channel-plugin.js";

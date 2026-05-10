/**
 * Main runtime entry. The OpenClaw host loads this module, calls the entry's
 * lazy `loadChannelPlugin()` to get the ChannelPlugin object, and calls
 * `register(api)` (which we wire here via `defineBundledChannelEntry`) so the
 * plugin can register itself.
 */
import {
  defineBundledChannelEntry,
  type BundledChannelEntryContract,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/channel-entry-contract";

const entry: BundledChannelEntryContract = defineBundledChannelEntry({
  id: "bluesky",
  name: "Bluesky",
  description: "Bluesky / AT Protocol channel for OpenClaw agents.",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin.js",
    exportName: "blueskyPlugin",
  },
  registerFull(api: OpenClawPluginApi) {
    api.registerChannel(entry.loadChannelPlugin());
  },
});

export default entry;

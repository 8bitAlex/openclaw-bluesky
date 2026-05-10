/** Setup-time entry. Loaded by the host before the full runtime. */
import {
  defineBundledChannelSetupEntry,
  type BundledChannelSetupEntryContract,
} from "openclaw/plugin-sdk/channel-entry-contract";

const entry: BundledChannelSetupEntryContract = defineBundledChannelSetupEntry({
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./setup-plugin.js",
    exportName: "blueskySetupPlugin",
  },
});

export default entry;

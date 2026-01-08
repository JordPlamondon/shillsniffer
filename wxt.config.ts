import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'ShillSniffer',
    description: 'Detect undisclosed commercial interest in Twitter/X posts',
    version: '0.1.0',
    permissions: ['storage'],
    host_permissions: [
      '*://api.x.com/*',
      '*://api.twitter.com/*',
      '*://x.com/*',
      '*://twitter.com/*',
    ],
    icons: {
      16: '/shillsniffer-icon.png',
      32: '/shillsniffer-icon.png',
      48: '/shillsniffer-icon.png',
      128: '/shillsniffer-icon.png',
    },
  },
});

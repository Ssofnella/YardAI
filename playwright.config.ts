import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3847" },
  webServer: {
    command: "npm run demo",
    url: "http://127.0.0.1:3847",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

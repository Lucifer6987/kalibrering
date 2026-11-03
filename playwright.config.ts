import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://127.0.0.1:3199",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run build && npm run seed && npm start",
    url: "http://127.0.0.1:3199/api/instruments",
    env: {
      PORT: "3199",
      DB_PATH: `/tmp/kalibrering-browser-${process.pid}.sqlite`,
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});

import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const serverDirectory = fileURLToPath(new URL("../server", import.meta.url));
const clientDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.playwright.ts",
    fullyParallel: false,
    workers: 1,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:5173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], channel: "msedge" },
        },
    ],
    webServer: [
        {
            command: "gradlew.bat bootRun",
            cwd: serverDirectory,
            url: "http://127.0.0.1:8080/api/rooms/health",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
        {
            command: "npm run dev",
            cwd: clientDirectory,
            url: "http://127.0.0.1:5173",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
    ],
});

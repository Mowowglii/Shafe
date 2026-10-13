import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("creates a room, connects two peers, closes signaling, then transfers a file", async ({ browser }) => {
    const senderContext = await browser.newContext({ acceptDownloads: true });
    const receiverContext = await browser.newContext({ acceptDownloads: true });
    await senderContext.grantPermissions(["clipboard-read", "clipboard-write"]);
    const sender = await senderContext.newPage();
    const receiver = await receiverContext.newPage();
    const fileName = "shafe-integration.txt";
    const fileContents = "P2P file transfer survives signaling shutdown.";

    try {
        await sender.goto("/");
        await sender.getByRole("button", { name: "Create a room" }).click();
        const roomIdElement = sender.locator("#current-room-id");
        await expect(roomIdElement).not.toBeEmpty({ timeout: 10_000 });
        const roomId = (await roomIdElement.textContent())?.trim();
        expect(roomId).toBeTruthy();
        await sender.getByRole("button", { name: "Copy room ID" }).click();
        await expect(sender.getByText("Room ID copied")).toBeVisible();
        expect(await sender.evaluate(() => navigator.clipboard.readText())).toBe(roomId);

        await receiver.goto("/");
        await receiver.getByRole("textbox", { name: "Room ID" }).fill(roomId!);
        await receiver.getByRole("button", { name: "Join room" }).click();

        await sender.locator("#file-input").setInputFiles({
            name: fileName,
            mimeType: "text/plain",
            buffer: Buffer.from(fileContents),
        });
        await expect(sender.getByRole("button", { name: "Send file" })).toBeDisabled();

        const readyStatus = "Peer-to-peer connection ready; signaling disconnected";
        await expect(sender.locator("#connection-status")).toHaveText(readyStatus, { timeout: 60_000 });
        await expect(receiver.locator("#connection-status")).toHaveText(readyStatus, { timeout: 60_000 });
        await expect(sender.getByRole("button", { name: "Send file" })).toBeEnabled();
        await expect(sender.locator("#app-error")).toBeHidden();

        await receiver.locator("#connection-status").evaluate((element) => {
            const status = element as HTMLElement;
            const receivedStatuses: string[] = [];
            const observer = new MutationObserver(() => {
                receivedStatuses.push(status.textContent ?? "");
                status.dataset.progressLog = JSON.stringify(receivedStatuses);
            });
            observer.observe(status, { childList: true, characterData: true, subtree: true });
        });
        await sender.getByRole("button", { name: "Send file" }).click();
        await expect(sender.locator("#progress-bar")).toBeHidden({ timeout: 30_000 });
        await expect(sender.locator("#transfer-complete")).toBeVisible();
        await expect(sender.locator("#transfer-complete-label")).toHaveText(`Transfer complete: ${fileName}`);
        await expect(sender.locator("#connection-status")).toHaveText(`File transfer completed: ${fileName}`);

        const receivedFileLink = receiver.locator("#transfer-complete-label").getByRole("link", {
            name: fileName,
        });
        await expect(receivedFileLink).toBeVisible({ timeout: 30_000 });
        await expect(receiver.locator("#progress-bar")).toBeHidden();
        await expect(receiver.locator("#transfer-complete")).toBeVisible();
        await expect(receiver.locator("#transfer-complete-label")).toContainText(`Received: ${fileName}`);
        const receivedStatuses = JSON.parse(
            (await receiver.locator("#connection-status").getAttribute("data-progress-log")) ?? "[]",
        ) as string[];
        expect(receivedStatuses.some((status) => status.startsWith(`Receiving ${fileName}…`))).toBe(true);
        expect(receivedStatuses.some((status) => /\d+ of \d+ chunks/.test(status))).toBe(false);
        await expect(receiver.locator("#received-files")).toHaveCount(0);
        const downloadPromise = receiver.waitForEvent("download");
        await receivedFileLink.click();
        const download = await downloadPromise;
        const downloadedPath = await download.path();
        expect(download.suggestedFilename()).toBe(fileName);
        expect(downloadedPath).not.toBeNull();
        expect(await readFile(downloadedPath!, "utf8")).toBe(fileContents);

        await receiver.getByRole("button", { name: "Leave room" }).click();
        await expect(receiver.getByRole("button", { name: "Create a room" })).toBeVisible();
        await expect(sender.locator("#peer-disconnect-notice")).toContainText(/peer|connection/i, { timeout: 30_000 });
        await expect(sender.getByRole("button", { name: "Send file" })).toBeDisabled();
    } finally {
        await senderContext.close();
        await receiverContext.close();
    }
});

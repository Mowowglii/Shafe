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

        await sender.locator("#file-input").setInputFiles([{
            name: fileName,
            mimeType: "text/plain",
            buffer: Buffer.from(fileContents),
        }, {
            name: "second-sender-file.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("Second file sent by sender."),
        }]);
        await receiver.locator("#file-input").setInputFiles([{
            name: "receiver-file.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("File sent by receiver."),
        }, {
            name: "second-receiver-file.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("Second file sent by receiver."),
        }]);
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
        const cancelFileName = "cancelled-large-file.bin";
        await sender.locator("#file-input").setInputFiles({
            name: cancelFileName,
            mimeType: "application/octet-stream",
            buffer: Buffer.alloc(32 * 1024 * 1024, 0x5a),
        });
        await sender.getByRole("button", { name: "Send file" }).click();
        await expect(sender.getByRole("button", { name: "Cancel transfer" })).toBeVisible({ timeout: 30_000 });
        await expect(receiver.getByRole("button", { name: "Cancel transfer" })).toBeHidden();
        await sender.getByRole("button", { name: "Cancel transfer" }).click();
        await expect(sender.locator("#connection-status")).toHaveText(`Transfer cancelled: ${cancelFileName}`, { timeout: 30_000 });
        await expect(receiver.locator("#connection-status")).toHaveText(`Transfer cancelled: ${cancelFileName}`, { timeout: 30_000 });
        await expect(sender.locator(`[data-transfer-id][data-direction="send"]`)).toHaveCount(1);
        await expect(receiver.locator(`[data-transfer-id][data-direction="receive"]`)).toHaveCount(1);

        await sender.locator("#file-input").setInputFiles([{
            name: fileName,
            mimeType: "text/plain",
            buffer: Buffer.from(fileContents),
        }, {
            name: "second-sender-file.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("Second file sent by sender."),
        }]);
        await sender.getByRole("button", { name: "Send file" }).click();
        await receiver.getByRole("button", { name: "Send file" }).click();
        const senderRows = sender.locator(`[data-direction="send"]`);
        const receiverRows = receiver.locator(`[data-direction="receive"]`);
        await expect(senderRows).toHaveCount(3);
        await expect(receiverRows).toHaveCount(3);
        await expect(senderRows.filter({ hasText: fileName }).locator(".transfer-complete")).toBeVisible({ timeout: 30_000 });
        await expect(senderRows.filter({ hasText: "second-sender-file.txt" }).locator(".transfer-complete")).toBeVisible({ timeout: 30_000 });
        await expect(receiver.locator(`[data-direction="send"]`)).toHaveCount(2);
        await expect(sender.locator(`[data-direction="receive"]`)).toHaveCount(2);

        const receivedFileLink = receiverRows.filter({ hasText: fileName }).locator(".transfer-complete-label").getByRole("link", {
            name: fileName,
        });
        await expect(receivedFileLink).toBeVisible({ timeout: 30_000 });
        await expect(receiverRows.filter({ hasText: fileName }).locator(".transfer-complete")).toBeVisible();
        const receivedStatuses = JSON.parse(
            (await receiver.locator("#connection-status").getAttribute("data-progress-log")) ?? "[]",
        ) as string[];
        expect(receivedStatuses.some((status) => status.startsWith(`Receiving ${fileName}…`))).toBe(true);
        expect(receivedStatuses.some((status) => /\d+ of \d+ chunks/.test(status))).toBe(false);
        const downloadPromise = receiver.waitForEvent("download");
        await receivedFileLink.click();
        const download = await downloadPromise;
        const downloadedPath = await download.path();
        expect(download.suggestedFilename()).toBe(fileName);
        expect(downloadedPath).not.toBeNull();
        expect(await readFile(downloadedPath!, "utf8")).toBe(fileContents);
        const senderReceivedRow = sender.locator(`[data-direction="receive"]`).filter({
            has: sender.getByText("receiver-file.txt", { exact: true }),
        });
        const senderReceivedLink = senderReceivedRow.locator(".transfer-complete-label a");
        await expect(senderReceivedLink).toBeVisible();
        const senderDownloadPromise = sender.waitForEvent("download");
        await senderReceivedLink.click();
        const senderDownload = await senderDownloadPromise;
        const senderDownloadedPath = await senderDownload.path();
        expect(senderDownload.suggestedFilename()).toBe("receiver-file.txt");
        expect(senderDownloadedPath).not.toBeNull();
        expect(await readFile(senderDownloadedPath!, "utf8")).toBe("File sent by receiver.");

        await receiver.getByRole("button", { name: "Leave room" }).click();
        await expect(receiver.getByRole("button", { name: "Create a room" })).toBeVisible();
        await expect(sender.locator("#peer-disconnect-notice")).toContainText(/peer|connection/i, { timeout: 30_000 });
        await expect(sender.getByRole("button", { name: "Send file" })).toBeDisabled();
    } finally {
        await senderContext.close();
        await receiverContext.close();
    }
});

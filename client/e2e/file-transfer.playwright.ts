import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("creates a room, connects two peers, closes signaling, then transfers a file", async ({ browser }) => {
    const senderContext = await browser.newContext({ acceptDownloads: true });
    const receiverContext = await browser.newContext({ acceptDownloads: true });
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

        await receiver.goto("/");
        await receiver.getByLabel("Room ID").fill(roomId!);
        await receiver.getByRole("button", { name: "Join room" }).click();

        const readyStatus = "Peer-to-peer connection ready; signaling disconnected";
        await expect(sender.getByRole("status")).toHaveText(readyStatus, { timeout: 60_000 });
        await expect(receiver.getByRole("status")).toHaveText(readyStatus, { timeout: 60_000 });

        await sender.locator("#file-input").setInputFiles({
            name: fileName,
            mimeType: "text/plain",
            buffer: Buffer.from(fileContents),
        });
        await sender.getByRole("button", { name: "Send file" }).click();

        const receivedFileLink = receiver.getByRole("link", { name: new RegExp(fileName) });
        await expect(receivedFileLink).toBeVisible({ timeout: 30_000 });
        const downloadPromise = receiver.waitForEvent("download");
        await receivedFileLink.click();
        const download = await downloadPromise;
        const downloadedPath = await download.path();
        expect(download.suggestedFilename()).toBe(fileName);
        expect(downloadedPath).not.toBeNull();
        expect(await readFile(downloadedPath!, "utf8")).toBe(fileContents);

        await receiver.getByRole("button", { name: "Leave room" }).click();
        await expect(receiver.getByRole("button", { name: "Create a room" })).toBeVisible();
        await expect(sender.getByRole("alert")).toContainText(/peer|connection/i, { timeout: 30_000 });
        await expect(sender.getByRole("button", { name: "Send file" })).toBeDisabled();
    } finally {
        await senderContext.close();
        await receiverContext.close();
    }
});

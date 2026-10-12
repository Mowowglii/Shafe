import { describe, expect, it, vi } from "vitest";
import type { FileTransferRequest, FileTransferResponse } from "../../src/types/filehandling.js";
import { FileTransferManager } from "../../src/webrtc/filetransfer.manager.js";

class MockWorker extends EventTarget {
  readonly messages: Array<{ message: FileTransferRequest; transfer?: Transferable[] }> = [];
  terminated = false;

  postMessage(message: FileTransferRequest, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: FileTransferResponse): void {
    this.dispatchEvent(new MessageEvent("message", { data: message }));
  }
}

class MockDataChannel extends EventTarget {
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readyState: RTCDataChannelState = "open";
  readonly send = vi.fn<(data: string | Blob | ArrayBuffer | ArrayBufferView) => void>();
}

function makeManager() {
  const worker = new MockWorker();
  const manager = new FileTransferManager(worker as unknown as Worker);
  const channel = new MockDataChannel();
  manager.bindDataChannel(channel as unknown as RTCDataChannel);
  return { manager, worker, channel };
}

describe("FileTransferManager", () => {
  it("requires an open data channel to start a file transfer", () => {
    const worker = new MockWorker();
    const manager = new FileTransferManager(worker as unknown as Worker);

    expect(() => manager.sendFile(new File(["data"], "sample.txt"))).toThrow(
      "Cannot send a file before the WebRTC data channel is open",
    );
    expect(worker.messages).toHaveLength(0);
    manager.close();
  });

  it("posts files to the worker and forwards received channel data", async () => {
    const { manager, worker, channel } = makeManager();
    const file = new File(["data"], "sample.txt", { type: "text/plain" });

    manager.sendFile(file);
    channel.dispatchEvent(Object.assign(new Event("message"), {
      data: JSON.stringify({ type: "file-metadata" }),
    }));
    await Promise.resolve();

    expect(channel.binaryType).toBe("arraybuffer");
    expect(worker.messages[0]?.message).toEqual({ type: "send-file", file });
    expect(worker.messages[1]?.message).toEqual({
      type: "receive-data",
      data: JSON.stringify({ type: "file-metadata" }),
    });

    manager.close();
  });

  it("sends worker packets over the data channel and acknowledges them", async () => {
    const { manager, worker, channel } = makeManager();

    worker.emit({ type: "send-data", packetId: 1, data: "metadata" });
    worker.emit({
      type: "send-data",
      packetId: 2,
      data: new Uint8Array([1, 2, 3]).buffer,
    });
    await Promise.resolve();

    expect(channel.send).toHaveBeenNthCalledWith(1, "metadata");
    expect(channel.send).toHaveBeenNthCalledWith(2, new Uint8Array([1, 2, 3]));
    expect(worker.messages.slice(-2).map(({ message }) => message)).toEqual([
      { type: "send-ack", packetId: 1 },
      { type: "send-ack", packetId: 2 },
    ]);

    manager.close();
  });

  it("exposes reconstructed file data as a Blob", () => {
    const { manager, worker } = makeManager();
    const received = vi.fn();
    manager.addEventListener("file-received", received);

    worker.emit({
      type: "file-received",
      metadata: {
        fileName: "sample.txt",
        mimeType: "text/plain",
        transferId: "transfer-1",
        fileSize: 4,
        totalChunk: 1,
      },
      data: new TextEncoder().encode("test").buffer,
    });

    const detail = (received.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail.blob).toBeInstanceOf(Blob);
    expect(detail.blob.type).toBe("text/plain");
    manager.close();
  });
});

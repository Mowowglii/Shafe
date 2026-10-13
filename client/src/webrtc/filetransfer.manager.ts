import type {
    FileMetadata,
    FileTransferRequest,
    FileTransferResponse,
} from "../types/filehandling.js";
import { DataChannelManager } from "./datachannelmanager.js";
import { encodeTransferCancellation } from "./filetransfer.protocol.js";

export type ReceivedFile = {
    metadata: FileMetadata;
    blob: Blob;
}

export class FileTransferManager extends EventTarget {
    private readonly worker: Worker;
    private readonly dataChannelManager = new DataChannelManager();
    private dataChannel: RTCDataChannel | null = null;
    private receiveQueue = Promise.resolve();

    constructor(worker = new Worker(
        new URL("../workers/ftManager.worker.ts", import.meta.url),
        { type: "module" },
    )) {
        super();
        this.worker = worker;
        this.worker.addEventListener("message", this.handleWorkerMessage);
        this.worker.addEventListener("error", this.handleWorkerError);
        this.worker.addEventListener("messageerror", this.handleWorkerMessageError);
        this.dataChannelManager.addEventListener("data-received", this.handleDataChannelMessage);
        this.dataChannelManager.addEventListener("data-channel-error", (event) => {
            this.dispatchEvent(new CustomEvent("data-channel-error", {
                detail: (event as CustomEvent<unknown>).detail,
            }));
        });
        this.dataChannelManager.addEventListener("data-channel-closed", () => {
            this.dataChannel = null;
            this.dispatchEvent(new CustomEvent("data-channel-closed"));
        });
        this.dataChannelManager.addEventListener("data-channel-open", () => {
            this.dispatchEvent(new CustomEvent("data-channel-open"));
        });
    }

    bindDataChannel(dataChannel: RTCDataChannel): void {
        this.dataChannel = dataChannel;
        dataChannel.binaryType = "arraybuffer";
        this.dataChannelManager.bindDataChannel(dataChannel);
        this.dispatchEvent(new CustomEvent("data-channel-bound"));
    }

    sendFile(file: File, transferId = crypto.randomUUID()): void {
        if (!this.dataChannel || this.dataChannel.readyState !== "open") {
            throw new Error("Cannot send a file before the WebRTC data channel is open");
        }
        this.worker.postMessage({ type: "send-file", file, transferId } satisfies FileTransferRequest);
    }

    cancelTransfer(transferId: string): void {
        this.worker.postMessage({ type: "cancel-transfer", transferId } satisfies FileTransferRequest);
    }

    close(): void {
        this.worker.removeEventListener("message", this.handleWorkerMessage);
        this.worker.removeEventListener("error", this.handleWorkerError);
        this.worker.removeEventListener("messageerror", this.handleWorkerMessageError);
        this.worker.terminate();
        this.dataChannelManager.unbindDataChannel();
        this.dataChannel = null;
    }

    private readonly handleWorkerMessage = (event: MessageEvent<FileTransferResponse>): void => {
        const response = event.data;
        switch (response.type) {
            case "send-data":
                void this.sendPacketOverDataChannel(response);
                break;
            case "file-send-complete":
                this.dispatchEvent(new CustomEvent("file-send-complete", { detail: response }));
                break;
            case "file-transfer-cancelled":
                this.dispatchEvent(new CustomEvent("file-transfer-cancelled", { detail: response }));
                break;
            case "send-cancel-notification":
                this.sendCancellationNotification(response.transferId);
                break;
            case "file-send-progress":
                this.dispatchEvent(new CustomEvent("file-send-progress", { detail: response }));
                break;
            case "file-receive-progress":
                this.dispatchEvent(new CustomEvent("file-receive-progress", { detail: response }));
                break;
            case "file-received": {
                const receivedFile: ReceivedFile = {
                    metadata: response.metadata,
                    blob: new Blob([response.data], { type: response.metadata.mimeType }),
                };
                this.dispatchEvent(new CustomEvent<ReceivedFile>("file-received", {
                    detail: receivedFile,
                }));
                break;
            }
            case "file-transfer-error":
                this.dispatchEvent(new CustomEvent("file-transfer-error", { detail: response }));
                break;
        }
    };

    private readonly handleWorkerError = (event: ErrorEvent): void => {
        this.dispatchEvent(new CustomEvent("file-transfer-error", {
            detail: { operation: "worker", reason: event.message },
        }));
    };

    private readonly handleWorkerMessageError = (): void => {
        this.dispatchEvent(new CustomEvent("file-transfer-error", {
            detail: { operation: "worker", reason: "Could not deserialize a worker message" },
        }));
    };

    private readonly handleDataChannelMessage = (event: Event): void => {
        const data = (event as CustomEvent<string | Blob | ArrayBuffer>).detail;
        this.receiveQueue = this.receiveQueue
            .then(async () => {
                if (typeof data === "string") {
                    this.worker.postMessage({ type: "receive-data", data } satisfies FileTransferRequest);
                } else if (data instanceof Blob) {
                    const buffer = await data.arrayBuffer();
                    this.worker.postMessage(
                        { type: "receive-data", data: buffer } satisfies FileTransferRequest,
                        [buffer],
                    );
                } else {
                    this.worker.postMessage(
                        { type: "receive-data", data } satisfies FileTransferRequest,
                        [data],
                    );
                }
            })
            .catch((error: unknown) => {
                this.dispatchEvent(new CustomEvent("file-transfer-error", {
                    detail: {
                        operation: "receive",
                        reason: error instanceof Error ? error.message : String(error),
                    },
                }));
            });
    };

    private async sendPacketOverDataChannel(
        response: Extract<FileTransferResponse, { type: "send-data" }>,
    ): Promise<void> {
        try {
            if (!this.dataChannel || this.dataChannel.readyState !== "open") {
                throw new Error("WebRTC data channel is not open");
            }
            if (typeof response.data === "string") {
                this.dataChannel.send(response.data);
            } else {
                await this.dataChannelManager.send(new Uint8Array(response.data));
            }
            this.worker.postMessage({
                type: "send-ack",
                packetId: response.packetId,
            } satisfies FileTransferRequest);
        } catch (error) {
            this.worker.postMessage({
                type: "send-failed",
                packetId: response.packetId,
                reason: error instanceof Error ? error.message : String(error),
            } satisfies FileTransferRequest);
        }
    }

    private sendCancellationNotification(transferId: string): void {
        try {
            if (!this.dataChannel || this.dataChannel.readyState !== "open") {
                throw new Error("WebRTC data channel is not open");
            }
            this.dataChannel.send(encodeTransferCancellation(transferId));
        } catch (error) {
            this.dispatchEvent(new CustomEvent("file-transfer-error", {
                detail: {
                    operation: "cancel",
                    reason: error instanceof Error ? error.message : String(error),
                },
            }));
        }
    }
}

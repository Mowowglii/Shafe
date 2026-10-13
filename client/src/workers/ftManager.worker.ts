import { DEFAULT_FILE_CHUNK_SIZE, type FileMetadata, type FileTransferRequest, type FileTransferResponse } from "../types/filehandling.js";
import { decodeFileChunk, decodeFileMetadata, decodeTransferCancellation, encodeFileChunk, encodeFileMetadata } from "../webrtc/filetransfer.protocol.js";
import { FileChunkingEngine } from "../webrtc/filechunking.service.js";
import { FileReconstructorEngine } from "../webrtc/filereconstructor.service.js";

type WorkerScope = {
    addEventListener(type: "message", listener: (event: MessageEvent<FileTransferRequest>) => void): void;
    postMessage(message: FileTransferResponse, transfer?: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;
const chunker = new FileChunkingEngine();
const reconstructor = new FileReconstructorEngine();
let nextPacketId = 0;
let sendInProgress = false;
let activeSend: { transferId: string; fileName: string; controller: AbortController } | null = null;
let receiveQueue = Promise.resolve();
const cancelledTransfers = new Set<string>();
const pendingAcknowledgements = new Map<number, {
    resolve: () => void;
    reject: (error: Error) => void;
}>();

reconstructor.addEventListener("file-reconstructed", (event) => {
    const detail = (event as CustomEvent<{ metadata: FileMetadata; data: ArrayBuffer }>).detail;
    workerScope.postMessage({
        type: "file-received",
        metadata: detail.metadata,
        data: detail.data,
    }, [detail.data]);
});

reconstructor.addEventListener("file-receive-progress", (event) => {
    const detail = (event as CustomEvent<{
        metadata: FileMetadata;
        receivedChunks: number;
    }>).detail;
    workerScope.postMessage({
        type: "file-receive-progress",
        fileName: detail.metadata.fileName,
        transferId: detail.metadata.transferId,
        receivedChunks: detail.receivedChunks,
        totalChunks: detail.metadata.totalChunk,
    });
});

for (const eventName of ["file-metadata-corrupted", "chunk-filename-corrupted", "chunk-payload-corrupted"]) {
    reconstructor.addEventListener(eventName, () => {
        reportError("receive", new Error(`Received invalid file transfer data (${eventName})`));
    });
}

reconstructor.addEventListener("chunk-duplicate", () => {
    reportError("receive", new Error("Received a duplicate file chunk"));
});

workerScope.addEventListener("message", ({ data }) => {
    switch (data.type) {
        case "send-file":
            void sendFile(data.file, data.transferId);
            break;
        case "cancel-transfer":
            cancelOutgoingTransfer(data.transferId);
            break;
        case "receive-data":
            receiveQueue = receiveQueue.then(() => receiveData(data.data)).catch((error: unknown) => {
                reportError("receive", error);
            });
            break;
        case "send-ack":
            pendingAcknowledgements.get(data.packetId)?.resolve();
            pendingAcknowledgements.delete(data.packetId);
            break;
        case "send-failed":
            pendingAcknowledgements.get(data.packetId)?.reject(new Error(data.reason));
            pendingAcknowledgements.delete(data.packetId);
            break;
    }
});

async function sendFile(file: File, transferId: string): Promise<void> {
    if (sendInProgress) {
        reportError("send", new Error("A file transfer is already in progress"));
        return;
    }

    sendInProgress = true;
    const controller = new AbortController();
    activeSend = { transferId, fileName: file.name, controller };
    let sentChunks = 0;
    try {
        const metadata = await chunker.chunkFile(
            file,
            transferId,
            async (chunk) => {
                await sendPacket(encodeFileChunk(chunk));
                sentChunks += 1;
                workerScope.postMessage({
                    type: "file-send-progress",
                    fileName: file.name,
                    transferId,
                    sentChunks,
                    totalChunks: Math.ceil(file.size / DEFAULT_FILE_CHUNK_SIZE),
                });
            },
            async (fileMetadata) => sendPacket(encodeFileMetadata(fileMetadata)),
            controller.signal,
        );
        workerScope.postMessage({
            type: "file-send-complete",
            fileName: metadata.fileName,
            transferId: metadata.transferId,
        });
    } catch (error) {
        if (controller.signal.aborted) {
            workerScope.postMessage({
                type: "file-transfer-cancelled",
                fileName: file.name,
                transferId,
            });
        } else {
            reportError("send", error);
        }
    } finally {
        if (activeSend?.transferId === transferId) {
            activeSend = null;
        }
        sendInProgress = false;
    }
}

function abortOutgoingTransfer(transferId: string): void {
    if (activeSend?.transferId !== transferId) {
        return;
    }
    activeSend.controller.abort();
    for (const [packetId, acknowledgement] of pendingAcknowledgements) {
        acknowledgement.reject(new DOMException("File transfer was cancelled", "AbortError"));
        pendingAcknowledgements.delete(packetId);
    }
}

function cancelOutgoingTransfer(transferId: string): void {
    if (activeSend?.transferId === transferId) {
        abortOutgoingTransfer(transferId);
        workerScope.postMessage({ type: "send-cancel-notification", transferId });
        return;
    }
    const metadata = reconstructor.cancelTransfer(transferId);
    if (metadata) {
        cancelledTransfers.add(transferId);
        workerScope.postMessage({
            type: "file-transfer-cancelled",
            fileName: metadata.fileName,
            transferId,
        });
        workerScope.postMessage({ type: "send-cancel-notification", transferId });
    }
}

async function sendPacket(data: string | ArrayBuffer): Promise<void> {
    const packetId = ++nextPacketId;
    const acknowledgement = new Promise<void>((resolve, reject) => {
        pendingAcknowledgements.set(packetId, { resolve, reject });
    });

    if (typeof data === "string") {
        workerScope.postMessage({ type: "send-data", packetId, data });
    } else {
        workerScope.postMessage({ type: "send-data", packetId, data }, [data]);
    }
    await acknowledgement;
}

async function receiveData(data: string | ArrayBuffer): Promise<void> {
    if (typeof data === "string") {
        const cancelledTransferId = decodeTransferCancellation(data);
        if (cancelledTransferId) {
            if (activeSend?.transferId === cancelledTransferId) {
                abortOutgoingTransfer(cancelledTransferId);
                return;
            }
            const metadata = reconstructor.cancelTransfer(cancelledTransferId);
            if (metadata) {
                cancelledTransfers.add(cancelledTransferId);
                workerScope.postMessage({
                    type: "file-transfer-cancelled",
                    fileName: metadata.fileName,
                    transferId: cancelledTransferId,
                });
            }
            return;
        }
        const metadata = decodeFileMetadata(data);
        if (!metadata) {
            throw new Error("Received invalid file metadata");
        }
        cancelledTransfers.delete(metadata.transferId);
        reconstructor.addFileToMap(metadata);
        return;
    }

    const chunk = decodeFileChunk(data);
    if (!chunk) {
        throw new Error("Received an invalid file chunk");
    }
    if (cancelledTransfers.has(chunk.metadata.transferId)) {
        return;
    }
    reconstructor.addChunkToFile(chunk);
}

function reportError(operation: string, error: unknown): void {
    workerScope.postMessage({
        type: "file-transfer-error",
        operation,
        reason: error instanceof Error ? error.message : String(error),
    });
}
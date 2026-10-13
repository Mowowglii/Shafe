export const DEFAULT_FILE_CHUNK_SIZE = 16 * 1024;

export type FileChunk = {
    metadata: ChunkMetadata;
    payload: Uint8Array;
}

export type ChunkMetadata = {
    fileName: string;
    transferId: string;
    chunkNumber: number;
}

export type FileMetadata = {
    fileName: string;
    mimeType: string;
    transferId: string;
    fileSize: number;
    totalChunk: number;
}

export type FileTransferRequest =
    | { type: "send-file"; file: File; transferId: string }
    | { type: "cancel-transfer"; transferId: string }
    | { type: "receive-data"; data: string | ArrayBuffer }
    | { type: "send-ack"; packetId: number }
    | { type: "send-failed"; packetId: number; reason: string };

export type FileTransferResponse =
    | { type: "send-data"; packetId: number; data: string | ArrayBuffer }
    | { type: "file-send-progress"; fileName: string; transferId: string; sentChunks: number; totalChunks: number }
    | { type: "file-receive-progress"; fileName: string; transferId: string; receivedChunks: number; totalChunks: number }
    | { type: "file-send-complete"; fileName: string; transferId: string }
    | { type: "file-transfer-cancelled"; fileName: string; transferId: string }
    | { type: "send-cancel-notification"; transferId: string }
    | { type: "file-received"; metadata: FileMetadata; data: ArrayBuffer }
    | { type: "file-transfer-error"; operation: string; reason: string };

export type FileChunkPacket = {
    type: "file-chunk";
    metadata: ChunkMetadata;
}

export type FileMetadataPacket = {
    type: "file-metadata";
    metadata: FileMetadata;
}

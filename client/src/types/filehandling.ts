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
    | { type: "send-file"; file: File }
    | { type: "receive-data"; data: string | ArrayBuffer }
    | { type: "send-ack"; packetId: number }
    | { type: "send-failed"; packetId: number; reason: string };

export type FileTransferResponse =
    | { type: "send-data"; packetId: number; data: string | ArrayBuffer }
    | { type: "file-send-complete"; fileName: string; transferId: string }
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

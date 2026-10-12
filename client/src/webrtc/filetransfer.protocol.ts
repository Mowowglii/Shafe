import type {
    FileChunk,
    FileChunkPacket,
    FileMetadata,
    FileMetadataPacket,
} from "../types/filehandling.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeFileMetadata(metadata: FileMetadata): string {
    const packet: FileMetadataPacket = { type: "file-metadata", metadata };
    return JSON.stringify(packet);
}

export function encodeFileChunk(chunk: FileChunk): ArrayBuffer {
    const header = encoder.encode(JSON.stringify({
        type: "file-chunk",
        metadata: chunk.metadata,
    } satisfies FileChunkPacket));
    const packet = new Uint8Array(4 + header.length + chunk.payload.length);
    new DataView(packet.buffer).setUint32(0, header.length);
    packet.set(header, 4);
    packet.set(chunk.payload, 4 + header.length);
    return packet.buffer;
}

export function decodeFileMetadata(data: string): FileMetadata | null {
    const packet: unknown = JSON.parse(data);
    if (!isRecord(packet) || packet.type !== "file-metadata" || !isFileMetadata(packet.metadata)) {
        return null;
    }
    return packet.metadata;
}

export function decodeFileChunk(data: ArrayBuffer): FileChunk | null {
    if (data.byteLength < 4) {
        return null;
    }
    const headerLength = new DataView(data).getUint32(0);
    if (headerLength === 0 || headerLength > data.byteLength - 4) {
        return null;
    }

    const header: unknown = JSON.parse(decoder.decode(new Uint8Array(data, 4, headerLength)));
    if (!isRecord(header) || header.type !== "file-chunk" || !isChunkMetadata(header.metadata)) {
        return null;
    }

    return {
        metadata: header.metadata,
        payload: new Uint8Array(data, 4 + headerLength),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFileMetadata(value: unknown): value is FileMetadata {
    return isRecord(value)
        && typeof value.fileName === "string"
        && typeof value.mimeType === "string"
        && typeof value.transferId === "string"
        && typeof value.fileSize === "number"
        && Number.isSafeInteger(value.fileSize)
        && value.fileSize >= 0
        && typeof value.totalChunk === "number"
        && Number.isSafeInteger(value.totalChunk)
        && value.totalChunk >= 0;
}

function isChunkMetadata(value: unknown): value is FileChunk["metadata"] {
    return isRecord(value)
        && typeof value.fileName === "string"
        && typeof value.transferId === "string"
        && typeof value.chunkNumber === "number"
        && Number.isSafeInteger(value.chunkNumber)
        && value.chunkNumber >= 0;
}

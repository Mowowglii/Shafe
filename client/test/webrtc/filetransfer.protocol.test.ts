import { describe, expect, it } from "vitest";
import type { FileChunk, FileMetadata } from "../../src/types/filehandling.js";
import {
  decodeFileChunk,
  decodeFileMetadata,
  encodeFileChunk,
  encodeFileMetadata,
} from "../../src/webrtc/filetransfer.protocol.js";

describe("file transfer protocol", () => {
  const metadata: FileMetadata = {
    fileName: "sample.bin",
    mimeType: "application/octet-stream",
    transferId: "transfer-1",
    fileSize: 4,
    totalChunk: 1,
  };

  it("round-trips file metadata", () => {
    expect(decodeFileMetadata(encodeFileMetadata(metadata))).toEqual(metadata);
  });

  it("encodes chunks as a compact binary packet and round-trips them", () => {
    const chunk: FileChunk = {
      metadata: { fileName: metadata.fileName, transferId: metadata.transferId, chunkNumber: 0 },
      payload: new Uint8Array([0, 1, 2, 255]),
    };

    const encoded = encodeFileChunk(chunk);

    expect(encoded.byteLength).toBeLessThan(120);
    expect(decodeFileChunk(encoded)).toEqual(chunk);
  });

  it("rejects malformed packet headers", () => {
    expect(decodeFileMetadata(JSON.stringify({ type: "file-chunk" }))).toBeNull();
    expect(decodeFileChunk(new ArrayBuffer(3))).toBeNull();
    expect(decodeFileChunk(new Uint8Array([255, 255, 255, 255]).buffer)).toBeNull();
  });
});

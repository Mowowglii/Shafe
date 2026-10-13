import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileChunk, FileMetadata } from "../../src/types/filehandling.js";
import type { FileReconstructorEngine as FileReconstructorEngineType } from "../../src/webrtc/filereconstructor.service.js";

describe("FileReconstructorEngine", () => {
  let FileReconstructorEngine: typeof FileReconstructorEngineType;

  beforeEach(async () => {
    vi.resetModules();
    ({ FileReconstructorEngine } = await import("../../src/webrtc/filereconstructor.service.js"));
  });

  function makeMetadata(overrides: Partial<FileMetadata> = {}): FileMetadata {
    return {
      fileName: "document.bin",
      mimeType: "application/octet-stream",
      transferId: "transfer-1",
      fileSize: 10,
      totalChunk: 3,
      ...overrides,
    };
  }

  function makeChunk(chunkNumber: number, payload: number[], transferId = "transfer-1"): FileChunk {
    return {
      metadata: { fileName: "document.bin", transferId, chunkNumber },
      payload: new Uint8Array(payload),
    };
  }

  it("reconstructs and emits a file when chunks arrive out of order", () => {
    const engine = new FileReconstructorEngine(4);
    const received = vi.fn();
    const progress = vi.fn();
    engine.addEventListener("file-reconstructed", received);
    engine.addEventListener("file-receive-progress", progress);
    engine.addFileToMap(makeMetadata());

    engine.addChunkToFile(makeChunk(2, [9, 10]));
    engine.addChunkToFile(makeChunk(0, [1, 2, 3, 4]));
    expect(received).not.toHaveBeenCalled();
    engine.addChunkToFile(makeChunk(1, [5, 6, 7, 8]));

    expect(received).toHaveBeenCalledOnce();
    expect(progress.mock.calls.map(([event]) => (event as CustomEvent).detail.receivedChunks))
      .toEqual([1, 2, 3]);
    expect(progress.mock.calls.map(([event]) => (event as CustomEvent).detail.metadata.totalChunk))
      .toEqual([3, 3, 3]);
    expect((received.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      metadata: makeMetadata(),
      data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer,
    });
  });

  it("accepts zero bytes as valid data and completes empty files", () => {
    const engine = new FileReconstructorEngine(4);
    const received = vi.fn();
    engine.addEventListener("file-reconstructed", received);
    engine.addFileToMap(makeMetadata({ fileSize: 0, totalChunk: 0 }));

    expect(received).toHaveBeenCalledOnce();
    expect((received.mock.calls[0]![0] as CustomEvent).detail.data).toEqual(new ArrayBuffer(0));
  });

  it("rejects chunks with invalid size or unknown transfer IDs", () => {
    const engine = new FileReconstructorEngine(4);
    const corrupted = vi.fn();
    engine.addEventListener("chunk-payload-corrupted", corrupted);
    engine.addFileToMap(makeMetadata());

    engine.addChunkToFile(makeChunk(0, [1, 2]));
    engine.addChunkToFile(makeChunk(0, [1, 2, 3, 4], "unknown-transfer"));

    expect(corrupted).toHaveBeenCalledOnce();
  });

  it("ignores duplicate chunks rather than corrupting completion accounting", () => {
    const engine = new FileReconstructorEngine(4);
    const received = vi.fn();
    const duplicate = vi.fn();
    engine.addEventListener("file-reconstructed", received);
    engine.addEventListener("chunk-duplicate", duplicate);
    engine.addFileToMap(makeMetadata({ fileSize: 8, totalChunk: 2 }));

    engine.addChunkToFile(makeChunk(0, [1, 2, 3, 4]));
    engine.addChunkToFile(makeChunk(0, [1, 2, 3, 4]));
    engine.addChunkToFile(makeChunk(1, [5, 6, 7, 8]));

    expect(received).toHaveBeenCalledOnce();
    expect(duplicate).toHaveBeenCalledOnce();
  });

  it("reports metadata whose declared chunk count does not match file size", () => {
    const engine = new FileReconstructorEngine(4);
    const corrupted = vi.fn();
    engine.addEventListener("file-metadata-corrupted", corrupted);

    engine.addFileToMap(makeMetadata({ totalChunk: 5 }));

    expect(corrupted).toHaveBeenCalledOnce();
  });
});

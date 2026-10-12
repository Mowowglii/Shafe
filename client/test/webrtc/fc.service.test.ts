import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileChunk, FileMetadata } from "../../src/types/filehandling";
import type { FileChunkingEngine as FileChunkingEngineType } from "../../src/webrtc/filechunking.service";

describe("FileChunkingEngine", () => {
  let FileChunkingEngine: typeof FileChunkingEngineType;

  beforeEach(async () => {
    vi.resetModules();
    ({ FileChunkingEngine } = await import("../../src/webrtc/filechunking.service"));
  });

  function makeFile(name: string, streamChunks: number[][]): File {
    const size = streamChunks.reduce((total, chunk) => total + chunk.length, 0);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of streamChunks) {
          controller.enqueue(new Uint8Array(chunk));
        }
        controller.close();
      },
    });

    return {
      name,
      type: "",
      size,
      stream: () => stream,
    } as unknown as File;
  }

  function eventDetail<T>(event: Event): T {
    return (event as CustomEvent<T>).detail;
  }

  it.each([
    { size: 0, totalChunk: 0 },
    { size: 3, totalChunk: 1 },
    { size: 4, totalChunk: 1 },
    { size: 5, totalChunk: 2 },
    { size: 8, totalChunk: 2 },
  ])("reports $totalChunk chunks for a $size-byte file", async ({ size, totalChunk }) => {
    const engine = new FileChunkingEngine(4);
    const metadataEvents: FileMetadata[] = [];
    engine.addEventListener("file-metadata-recovered", (event) => {
      metadataEvents.push(eventDetail(event));
    });

    await engine.chunkFile(
      makeFile("sample.bin", size === 0 ? [] : [Array.from({ length: size }, (_, i) => i + 1)]),
      "test-transfer",
    );

    expect(metadataEvents).toEqual([{
      fileName: "sample.bin",
      mimeType: "",
      transferId: "test-transfer",
      fileSize: size,
      totalChunk,
    }]);
  });

  it("emits fixed-size, ordered chunks even when the stream splits bytes at different boundaries", async () => {
    const engine = new FileChunkingEngine(4);
    const generatedChunks: FileChunk[] = [];
    engine.addEventListener("chunk-generated", (event) => {
      generatedChunks.push(eventDetail(event));
    });

    await engine.chunkFile(makeFile("sample.bin", [[1, 2], [3, 4, 5, 6, 7], [8]]), "test-transfer");

    expect(generatedChunks).toEqual([
      {
        metadata: { fileName: "sample.bin", transferId: "test-transfer", chunkNumber: 0 },
        payload: new Uint8Array([1, 2, 3, 4]),
      },
      {
        metadata: { fileName: "sample.bin", transferId: "test-transfer", chunkNumber: 1 },
        payload: new Uint8Array([5, 6, 7, 8]),
      },
    ]);
  });

  it("emits one final partial chunk and no chunks for an empty file", async () => {
    const engine = new FileChunkingEngine(4);
    const generatedChunks: FileChunk[] = [];
    engine.addEventListener("chunk-generated", (event) => {
      generatedChunks.push(eventDetail(event));
    });

    await engine.chunkFile(makeFile("partial.bin", [[9, 10]]), "partial-transfer");
    await engine.chunkFile(makeFile("empty.bin", []), "empty-transfer");

    expect(generatedChunks).toEqual([
      {
        metadata: { fileName: "partial.bin", transferId: "partial-transfer", chunkNumber: 0 },
        payload: new Uint8Array([9, 10]),
      },
    ]);
  });

  it("waits for each chunk's send callback before reading the next chunk", async () => {
    const engine = new FileChunkingEngine(4);
    const chunkOrder: number[] = [];

    await engine.chunkFile(
      makeFile("sample.bin", [[1, 2, 3, 4, 5, 6, 7, 8]]),
      "test-transfer",
      async (chunk) => {
        chunkOrder.push(chunk.metadata.chunkNumber);
        await Promise.resolve();
      },
    );

    expect(chunkOrder).toEqual([0, 1]);
  });
});
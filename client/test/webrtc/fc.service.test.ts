import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileChunk, FileMetadata } from "../../src/types/filehandling.js";
import type { FileChunkingEngine as FileChunkingEngineType } from "../../src/webrtc/filechunking.service.js";

type SerializedFileChunk = {
  metadata: FileChunk["metadata"] & { totalChunk: number };
  payload: number[];
};

describe("FileChunkingEngine", () => {
  let FileChunkingEngine: typeof FileChunkingEngineType;

  beforeEach(async () => {
    vi.stubEnv("CHUNK_SIZE", "4");
    vi.resetModules();
    ({ FileChunkingEngine } = await import("../../src/webrtc/filechunking.service.js"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
      size,
      stream: () => stream,
    } as unknown as File;
  }

  function eventDetail<T>(event: Event): T {
    return (event as CustomEvent<T>).detail;
  }

  function decodeChunk(data: Uint8Array): SerializedFileChunk {
    return JSON.parse(new TextDecoder().decode(data)) as SerializedFileChunk;
  }

  it.each([
    { size: 0, totalChunk: 0 },
    { size: 3, totalChunk: 1 },
    { size: 4, totalChunk: 1 },
    { size: 5, totalChunk: 2 },
    { size: 8, totalChunk: 2 },
  ])("reports $totalChunk chunks for a $size-byte file", async ({ size, totalChunk }) => {
    const engine = new FileChunkingEngine();
    const metadataEvents: FileMetadata[] = [];
    engine.addEventListener("file-metadata-recovered", (event) => {
      metadataEvents.push(eventDetail(event));
    });

    await engine.chunkFile(makeFile("sample.bin", size === 0 ? [] : [Array.from({ length: size }, (_, i) => i + 1)]));

    expect(metadataEvents).toEqual([{ fileName: "sample.bin", totalChunk }]);
  });

  it("emits fixed-size, ordered chunks even when the stream splits bytes at different boundaries", async () => {
    const engine = new FileChunkingEngine();
    const generatedChunks: Uint8Array[] = [];
    engine.addEventListener("chunk-generated", (event) => {
      generatedChunks.push(eventDetail(event));
    });

    await engine.chunkFile(makeFile("sample.bin", [[1, 2], [3, 4, 5, 6, 7], [8]]));

    expect(generatedChunks.map(decodeChunk)).toEqual([
      {
        metadata: { fileName: "sample.bin", totalChunk: 2, chunkNumber: 0 },
        payload: [1, 2, 3, 4],
      },
      {
        metadata: { fileName: "sample.bin", totalChunk: 2, chunkNumber: 1 },
        payload: [5, 6, 7, 8],
      },
    ]);
  });

  it("emits one final partial chunk and no chunks for an empty file", async () => {
    const engine = new FileChunkingEngine();
    const generatedChunks: Uint8Array[] = [];
    engine.addEventListener("chunk-generated", (event) => {
      generatedChunks.push(eventDetail(event));
    });

    await engine.chunkFile(makeFile("partial.bin", [[9, 10]]));
    await engine.chunkFile(makeFile("empty.bin", []));

    expect(generatedChunks.map(decodeChunk)).toEqual([
      {
        metadata: { fileName: "partial.bin", totalChunk: 1, chunkNumber: 0 },
        payload: [9, 10],
      },
    ]);
  });
});
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileChunk, FileMetadata } from "../../src/types/filehandling.js";
import type { FileReconstructorEngine as FileReconstructorEngineType } from "../../src/webrtc/filereconstructor.service.js";

describe("FileReconstructorEngine", () => {
  let FileReconstructorEngine: typeof FileReconstructorEngineType;

  beforeEach(async () => {
    vi.stubEnv("CHUNK_SIZE", "4");
    vi.resetModules();
    ({ FileReconstructorEngine } = await import("../../src/webrtc/filereconstructor.service.js"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function reconstructedFile(
    engine: FileReconstructorEngineType,
    fileName: string,
  ): Uint8Array | undefined {
    const internals = engine as unknown as { fileMap: Map<string, Uint8Array> };
    return internals.fileMap.get(fileName);
  }

  function makeChunk(fileName: string, chunkNumber: number, payload: number[]): FileChunk {
    return {
      metadata: { fileName, chunkNumber },
      payload: new Uint8Array(payload),
    };
  }

  it("allocates a zero-filled buffer sized for the declared number of chunks", () => {
    const engine = new FileReconstructorEngine();
    const metadata: FileMetadata = { fileName: "document.bin", totalChunk: 3 };

    engine.addFileToMap(metadata);

    expect(reconstructedFile(engine, metadata.fileName)).toEqual(new Uint8Array(12));
  });

  it("writes chunks into their positions regardless of arrival order", () => {
    const engine = new FileReconstructorEngine();
    engine.addFileToMap({ fileName: "document.bin", totalChunk: 3 });

    engine.addChunkToFile(makeChunk("document.bin", 2, [9, 10]));
    engine.addChunkToFile(makeChunk("document.bin", 0, [1, 2, 3, 4]));
    engine.addChunkToFile(makeChunk("document.bin", 1, [5, 6]));

    expect(reconstructedFile(engine, "document.bin")).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6, 0, 0, 9, 10, 0, 0]),
    );
  });

  it("accepts zero bytes as valid binary payload", () => {
    const engine = new FileReconstructorEngine();
    engine.addFileToMap({ fileName: "document.bin", totalChunk: 1 });
    const corrupted = vi.fn();
    engine.addEventListener("chunk-payload-corrupted", corrupted);

    engine.addChunkToFile(makeChunk("document.bin", 0, [0, 7, 0]));

    expect(corrupted).not.toHaveBeenCalled();
    expect(reconstructedFile(engine, "document.bin")).toEqual(new Uint8Array([0, 7, 0, 0]));
  });

  it("ignores chunks for files that have not been registered", () => {
    const engine = new FileReconstructorEngine();
    const corrupted = vi.fn();
    engine.addEventListener("chunk-filename-corrupted", corrupted);

    expect(() => engine.addChunkToFile(makeChunk("missing.bin", 0, [1, 2]))).not.toThrow();
    expect(corrupted).not.toHaveBeenCalled();
  });

  it("replaces the reconstruction buffer when metadata is registered again", () => {
    const engine = new FileReconstructorEngine();
    engine.addFileToMap({ fileName: "document.bin", totalChunk: 1 });
    engine.addChunkToFile(makeChunk("document.bin", 0, [1, 2]));

    engine.addFileToMap({ fileName: "document.bin", totalChunk: 2 });

    expect(reconstructedFile(engine, "document.bin")).toEqual(new Uint8Array(8));
  });
});
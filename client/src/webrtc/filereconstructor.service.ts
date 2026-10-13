import { DEFAULT_FILE_CHUNK_SIZE, type FileChunk, type FileMetadata } from "../types/filehandling.js";

type ActiveFile = {
    metadata: FileMetadata;
    buffer: Uint8Array;
    receivedChunks: Set<number>;
}

export class FileReconstructorEngine extends EventTarget {
    private readonly maxChunkSize: number;
    private readonly fileMap = new Map<string, ActiveFile>();

    constructor(maxChunkSize = DEFAULT_FILE_CHUNK_SIZE) {
        super();
        if (!Number.isSafeInteger(maxChunkSize) || maxChunkSize <= 0) {
            throw new RangeError("Chunk size must be a positive safe integer");
        }
        this.maxChunkSize = maxChunkSize;
    }

    public addFileToMap(fileMetadata: FileMetadata): void {
        if (!this.isValidMetadata(fileMetadata)) {
            this.dispatchEvent(new CustomEvent("file-metadata-corrupted"));
            return;
        }

        const activeFile: ActiveFile = {
            metadata: fileMetadata,
            buffer: new Uint8Array(fileMetadata.fileSize),
            receivedChunks: new Set<number>(),
        };
        this.fileMap.set(fileMetadata.transferId, activeFile);

        if (fileMetadata.totalChunk === 0) {
            this.completeFile(activeFile);
        }
    }

    public addChunkToFile(chunk: FileChunk): void {
        const activeFile = this.fileMap.get(chunk.metadata.transferId);
        if (!activeFile
            || activeFile.metadata.fileName !== chunk.metadata.fileName
            || !Number.isSafeInteger(chunk.metadata.chunkNumber)
            || chunk.metadata.chunkNumber < 0
            || chunk.metadata.chunkNumber >= activeFile.metadata.totalChunk) {
            this.dispatchEvent(new CustomEvent("chunk-filename-corrupted"));
            return;
        }

        if (activeFile.receivedChunks.has(chunk.metadata.chunkNumber)) {
            this.dispatchEvent(new CustomEvent("chunk-duplicate"));
            return;
        }

        const offset = this.maxChunkSize * chunk.metadata.chunkNumber;
        const expectedLength = Math.min(
            this.maxChunkSize,
            activeFile.metadata.fileSize - offset,
        );
        if (chunk.payload.length !== expectedLength) {
            this.dispatchEvent(new CustomEvent("chunk-payload-corrupted"));
            return;
        }

        activeFile.buffer.set(chunk.payload, offset);
        activeFile.receivedChunks.add(chunk.metadata.chunkNumber);
        this.dispatchEvent(new CustomEvent("file-receive-progress", {
            detail: {
                metadata: activeFile.metadata,
                receivedChunks: activeFile.receivedChunks.size,
            },
        }));
        if (activeFile.receivedChunks.size === activeFile.metadata.totalChunk) {
            this.completeFile(activeFile);
        }
    }

    public cancelTransfer(transferId: string): FileMetadata | null {
        const activeFile = this.fileMap.get(transferId);
        if (!activeFile) {
            return null;
        }
        this.fileMap.delete(transferId);
        return activeFile.metadata;
    }

    private completeFile(activeFile: ActiveFile): void {
        this.fileMap.delete(activeFile.metadata.transferId);
        this.dispatchEvent(new CustomEvent("file-reconstructed", {
            detail: {
                metadata: activeFile.metadata,
                data: activeFile.buffer.buffer,
            },
        }));
    }

    private isValidMetadata(metadata: FileMetadata): boolean {
        return typeof metadata.fileName === "string"
            && typeof metadata.mimeType === "string"
            && typeof metadata.transferId === "string"
            && metadata.transferId.length > 0
            && Number.isSafeInteger(metadata.fileSize)
            && metadata.fileSize >= 0
            && Number.isSafeInteger(metadata.totalChunk)
            && metadata.totalChunk === Math.ceil(metadata.fileSize / this.maxChunkSize);
    }
}

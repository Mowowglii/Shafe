import { DEFAULT_FILE_CHUNK_SIZE, type ChunkMetadata, type FileChunk, type FileMetadata } from "../types/filehandling.js";

export class FileChunkingEngine extends EventTarget{
    private readonly maxChunkSize: number;

    constructor(maxChunkSize = DEFAULT_FILE_CHUNK_SIZE){
        super();
        if (!Number.isSafeInteger(maxChunkSize) || maxChunkSize <= 0) {
            throw new RangeError("Chunk size must be a positive safe integer");
        }
        this.maxChunkSize = maxChunkSize;
    }

    private setChunkMetadata(fileName: string, transferId: string, chunkNumber: number): ChunkMetadata {
        return { fileName, transferId, chunkNumber };
    }

    private getFileMetaData(file: File, transferId: string): FileMetadata {
        const totalChunk = Math.ceil(file.size / this.maxChunkSize);
        return {
            fileName: file.name,
            mimeType: file.type,
            transferId,
            fileSize: file.size,
            totalChunk,
        };
    }

    private async emitChunk(
        chunkMetadata: ChunkMetadata,
        payload: Uint8Array,
        onChunk?: (chunk: FileChunk) => Promise<void>,
    ): Promise<void> {
        const chunk = { metadata: chunkMetadata, payload };
        this.dispatchEvent(new CustomEvent<FileChunk>("chunk-generated", { detail: chunk }));
        await onChunk?.(chunk);
    }

    async chunkFile(
        file: File,
        transferId = crypto.randomUUID(),
        onChunk?: (chunk: FileChunk) => Promise<void>,
        onMetadata?: (metadata: FileMetadata) => Promise<void>,
    ): Promise<FileMetadata> {
        const fileMetadata = this.getFileMetaData(file, transferId);
        this.dispatchEvent(new CustomEvent<FileMetadata>("file-metadata-recovered", { detail: fileMetadata }));
        await onMetadata?.(fileMetadata);
        
        let chunkNumber = 0;
        let chunkOffset = 0;
        let chunkValues = new Uint8Array(this.maxChunkSize);

        for await (const streamChunk of file.stream()){
            let streamOffset = 0;

            while (streamOffset < streamChunk.length) {
                const streamSpace = streamChunk.length - streamOffset;
                const chunkSpace = chunkValues.length - chunkOffset;

                if (streamSpace <= chunkSpace ){ // consume streamChunk
                        chunkValues.set(streamChunk.subarray(streamOffset), chunkOffset);
                        streamOffset += streamSpace;
                        chunkOffset += streamSpace;

                        if (chunkValues.length == chunkOffset){
                            await this.emitChunk(
                                this.setChunkMetadata(file.name, transferId, chunkNumber),
                                chunkValues,
                                onChunk,
                            );
                                
                            chunkNumber += 1;

                            chunkOffset = 0;
                            chunkValues = new Uint8Array(this.maxChunkSize);
                        }
                } else { // fill chunkValue and give it
                    chunkValues.set(streamChunk.subarray(streamOffset, streamOffset + chunkSpace), chunkOffset);
                    streamOffset += chunkSpace;
                    
                    await this.emitChunk(
                        this.setChunkMetadata(file.name, transferId, chunkNumber),
                        chunkValues,
                        onChunk,
                    );

                    chunkNumber += 1;

                    // restrict chunkOffset
                    chunkOffset = 0;
                    chunkValues = new Uint8Array(this.maxChunkSize);
                }
            }
        }

        if (chunkOffset > 0) {
            await this.emitChunk(
                this.setChunkMetadata(file.name, transferId, chunkNumber),
                chunkValues.subarray(0, chunkOffset),
                onChunk,
            );
        }
        return fileMetadata;
    }

}
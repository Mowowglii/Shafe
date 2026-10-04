import type { ChunkMetadata, FileChunk, FileMetadata } from "../types/filehandling.js";

export class FileChunkingEngine extends EventTarget{
    private static readonly MAX_CHUNK_SIZE : number = import.meta.env.CHUNK_SIZE;

    constructor(){
        super();
    }

    private fileChunkToUint8Array(data : FileChunk) : Uint8Array{
        return new TextEncoder().encode(JSON.stringify({
            metadata: data.metadata,
            payload: Array.from(data.payload)
        }));
    }

    private setChunkMetadata(fileName : string, chunknumber : number) : ChunkMetadata{
        return { fileName : fileName, chunkNumber : chunknumber } as ChunkMetadata;
    }

    private getFileMetaData(file : File): FileMetadata{
        // Equals the next multiple of MAX_CHUNK_SIZE
        const totalChunkNeeded : number = Math.ceil(file.size / FileChunkingEngine.MAX_CHUNK_SIZE);
        return {fileName : file.name, totalChunk : totalChunkNeeded} as FileMetadata;
    }

    private emitChunk(chunkMetadata : ChunkMetadata, payload : Uint8Array){
        this.dispatchEvent(new CustomEvent("chunk-generated", { 
                            detail : this.fileChunkToUint8Array({ 
                                metadata : chunkMetadata,
                                payload : payload
                            } as FileChunk)
                        }));
    }

    async chunkFile(file : File){
        const fileMetadata : FileMetadata = this.getFileMetaData(file);

        this.dispatchEvent(new CustomEvent("file-metadata-recovered", {detail : fileMetadata}));
        
        let chunkNumber : number = 0;
        let chunkOffset : number = 0;
        let chunkValues : Uint8Array = new Uint8Array(FileChunkingEngine.MAX_CHUNK_SIZE);

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
                            this.emitChunk(this.setChunkMetadata(file.name, chunkNumber), chunkValues);
                                
                            chunkNumber += 1;

                            chunkOffset = 0;
                        }
                } else { // fill chunkValue and give it
                    chunkValues.set(streamChunk.subarray(streamOffset, streamOffset + chunkSpace), chunkOffset);
                    streamOffset += chunkSpace;
                    
                    this.emitChunk(this.setChunkMetadata(file.name, chunkNumber), chunkValues);

                    chunkNumber += 1;

                    // restrict chunkOffset
                    chunkOffset = 0;
                }
            }
        }

        if (file.size % FileChunkingEngine.MAX_CHUNK_SIZE != 0){
            this.emitChunk(this.setChunkMetadata(file.name, chunkNumber), chunkValues.subarray(0, file.size % FileChunkingEngine.MAX_CHUNK_SIZE))
        }
    }

}
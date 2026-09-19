import type { ChunkMetadata, FileChunk,FileMetadata } from "../types/filehandling.js"

export class FileChunkingEngine extends EventTarget{
    private readonly MAX_CHUNK_SIZE : number = 64*1024; // 64 KB

    constructor(){
        super()
    }

    private fileChunkToUint8Array(data : FileChunk) : Uint8Array{
        return new TextEncoder().encode(JSON.stringify(data));
    }

    private setChunkMetadata(fileMetadata : FileMetadata, chunknumber : number) : ChunkMetadata{
        return { fileName : fileMetadata.fileName, totalChunk : fileMetadata.totalChunk, chunkNumber : chunknumber } as ChunkMetadata;
    }

    private getFileMetaData(file : File): FileMetadata{
        // Equals the next multiple of MAX_CHUNK_SIZE
        const totalChunkNeeded : number = (file.size + (file.size % this.MAX_CHUNK_SIZE)) / this.MAX_CHUNK_SIZE;
        return {fileName : file.name, totalChunk : totalChunkNeeded} as FileMetadata;
    }

    async chunkFile(file : File){
        const fileMetadata : FileMetadata = this.getFileMetaData(file);

        this.dispatchEvent(new CustomEvent("file-metadata-recovered", {detail : fileMetadata}));
        
        var chunkNumber : number = 1;

        for await (const chunk of file.stream()){
            let offset = 0;
            while (offset < chunk.length) {
                const end = Math.min(offset + this.MAX_CHUNK_SIZE, chunk.length);
                const piece = chunk.slice(offset, end);
                const fileChunk : FileChunk = { metadata : this.setChunkMetadata(fileMetadata, chunkNumber), payload : chunk } as FileChunk;
                const data = this.fileChunkToUint8Array(fileChunk);

            }
        }
    }

}
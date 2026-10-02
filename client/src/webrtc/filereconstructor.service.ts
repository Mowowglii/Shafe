import type { FileMetadata } from "../types/filehandling.js";
import type { FileChunk } from "../types/filehandling.js";

export class FileReconstructorEngine extends EventTarget{
    private static readonly MAX_CHUNK_SIZE : number = import.meta.env.CHUNK_SIZE;
    private fileMap : Map<string, Uint8Array> = new Map();
    
    constructor(){
        super()
    }

    public addFileToMap(fileMetadata : FileMetadata){
        this.fileMap.set(fileMetadata.fileName, new Uint8Array(FileReconstructorEngine.MAX_CHUNK_SIZE * fileMetadata.totalChunk));
    }

    public addChunkToFile(chunk : FileChunk){
        if (this.fileMap.has(chunk.metadata.fileName)){
            let recoverBuffer : Uint8Array | undefined = this.fileMap.get(chunk.metadata.fileName);
            
            if (!recoverBuffer){
                this.dispatchEvent(new CustomEvent("chunk-filename-corrupted"));
                return;
            }

            for (let i : number = 0; i < chunk.payload.length; i++){
                let payload_byte : number | undefined = chunk.payload[i];
                let byte : number;

                if(!payload_byte){
                    this.dispatchEvent(new CustomEvent("chunk-payload-corrupted"));
                    return;
                } else {
                    byte = payload_byte;
                }

                recoverBuffer[FileReconstructorEngine.MAX_CHUNK_SIZE * chunk.metadata.chunkNumber + i] = byte;
            }
        }
    }
}
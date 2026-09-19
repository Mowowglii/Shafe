export type FileChunk  = {
    metadata : ChunkMetadata,
    payload : Uint8Array
}

export type ChunkMetadata = {
    fileName: string,
    totalChunk: number,
    chunkNumber: number
}

export type FileMetadata = {
    fileName: string,
    totalChunk: number
}
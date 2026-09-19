export type BinaryDataChannel = RTCDataChannel & {
    binaryType: BinaryType;
    send(data : string | Blob | ArrayBuffer | ArrayBufferView): void;
}
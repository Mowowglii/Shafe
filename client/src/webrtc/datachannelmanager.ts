import type { BinaryDataChannel } from "../types/binarydc.js";

export class DataChannelManager extends EventTarget{
    private dc : BinaryDataChannel | null = null;
    private readonly HIGH_WATERMARK : number = 1024 * 1024; // Pause sending when exceeding 1 MB
    private cancelPendingDrain: (() => void) | null = null;
    private readonly handleOpen = () => {
        this.dc?.removeEventListener("open", this.handleOpen);
        this.setupDataChannel();
    };
    private readonly handleClose = () => {
        this.unbindDataChannel();
        this.dispatchEvent(new CustomEvent("data-channel-closed"));
    };
    private readonly handleMessage = (event: Event) => {
        this.dispatchEvent(new CustomEvent("data-received", {
            detail: (event as MessageEvent).data,
        }));
    };
    private readonly handleError = (event: Event) => {
        this.dispatchEvent(new CustomEvent("data-channel-error", {
            detail: (event as ErrorEvent).error,
        }));
    };

    constructor(){
        super();
    }

    bindDataChannel(dataChannel : RTCDataChannel){
        this.unbindDataChannel();
        this.dc = dataChannel as BinaryDataChannel;
        // Set the Low Threshold of the buffer 
        this.dc.bufferedAmountLowThreshold = 256 * 1024;
        if (this.dc.readyState === "open"){
            this.setupDataChannel();
        } else {
            this.dc.addEventListener("open", this.handleOpen, { once: true });
        }

    }

    unbindDataChannel(): void {
        const dataChannel = this.dc;
        if (!dataChannel) {
            return;
        }
        this.cancelPendingDrain?.();
        dataChannel.removeEventListener("open", this.handleOpen);
        dataChannel.removeEventListener("close", this.handleClose);
        dataChannel.removeEventListener("message", this.handleMessage);
        dataChannel.removeEventListener("error", this.handleError);
        this.dc = null;
    }

    async send(chunk : Uint8Array){
        // Check data channel
        if (!this.dc){
            return;
        }

        // if DataChannel buffer contains too much data 
        if ( this.dc.bufferedAmount > this.HIGH_WATERMARK ){
            // Pause sending and wait for lowThreshold event
            await this.waitForBufferToDrain();
        }
        if (!this.dc || this.dc.readyState !== "open") {
            throw new Error("WebRTC data channel closed before the chunk could be sent");
        }
        // Send data
        this.dc.send(chunk);
    }

    private waitForBufferToDrain() : Promise<void>{
        const dataChannel = this.dc;
        if (!dataChannel || dataChannel.readyState !== "open") {
            return Promise.reject(new Error("WebRTC data channel is not open"));
        }

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                dataChannel.removeEventListener("bufferedamountlow", onBufferLow);
                dataChannel.removeEventListener("close", onClose);
                if (this.cancelPendingDrain === onClose) {
                    this.cancelPendingDrain = null;
                }
            };
            const onBufferLow = () => {
                cleanup();
                resolve();
            };
            const onClose = () => {
                cleanup();
                reject(new Error("WebRTC data channel closed while waiting for its send buffer"));
            };
            dataChannel.addEventListener("bufferedamountlow", onBufferLow, { once: true });
            dataChannel.addEventListener("close", onClose, { once: true });
            this.cancelPendingDrain = onClose;
        });
    }

    private setupDataChannel(){
        this.dc?.addEventListener("close", this.handleClose);
        this.dc?.addEventListener("message", this.handleMessage);
        this.dc?.addEventListener("error", this.handleError);
    }
}
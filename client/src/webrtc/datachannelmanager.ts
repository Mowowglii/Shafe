import { uint8ArrayToBase64 } from "../utils/converters.js";
import { base64ToUint8Array } from "../utils/converters.js";

export class DataChannelManager extends EventTarget{
    private dc : RTCDataChannel | null = null;
    private readonly HIGH_WATERMARK : number = 1024 * 1024; // Pause sending when exceeding 1 MB

    constructor(){
        super();
    }

    bindDataChannel(dataChannel : RTCDataChannel){
        this.dc = dataChannel;
        // Set the Low Threshold of the buffer 
        this.dc.bufferedAmountLowThreshold = 256 * 1024;
        if (this.dc.readyState === "open"){
            this.setupDataChannel();
        } else {
            this.dc.addEventListener("open", (event) => {
                this.setupDataChannel();
            });
        }

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
        // Send data
        this.dc.send(uint8ArrayToBase64(chunk));
    }

    private waitForBufferToDrain() : Promise<void>{
        return new Promise((resolve) => {
            this.dc?.addEventListener(
                "bufferedamountlow",
                () => { resolve() },
                { once : true }
            )
        });
    }

    private setupDataChannel(){
        // SETUP LISTENERS
        this.dc?.addEventListener("close", (event) => {
            // Clear dc for possible reuse
            this.dc = null;
            // Notify on data channel closed
            this.dispatchEvent(new CustomEvent("data-channel-closed"));
        })

        this.dc?.addEventListener("message", (event) => {
            // notify for file reconstruction
            this.dispatchEvent(new CustomEvent("data-received", { detail : base64ToUint8Array(event.data) }));
        });

        this.dc?.addEventListener("error", (event) => {
            // Notify on data channel error
            this.dispatchEvent(new CustomEvent("data-channel-error", { detail : event.error }));
        });
    }
}
import type { SignalingMessage } from "../types/sigmessage.js";

export class PeerManagerService extends EventTarget{
    private pc : RTCPeerConnection | null = null;
    private iceCandidateBuffer : Array<RTCIceCandidate> = [];
    private isOfferAnswerFinished : boolean = false;
    private config : RTCConfiguration | null = null;

    constructor(config : RTCConfiguration){
        super();
        this.config = config;
        this.createPc();
    }

    restart(config? : RTCConfiguration){
        // Set config if set in parameter
        if (config){
            this.config = config;
        }

        // reset flag, buffer and data channel
        this.isOfferAnswerFinished = false;
        this.iceCandidateBuffer = [];

        // Close existing peer connection if present
        if (this.pc){
            this.pc.close();
        }

        // Create a new RTCPeerConnection
        this.createPc();
    }

    private createPc(){
        // Instanciate the PeerConnection with the given configuration (stun servers)
        this.pc = new RTCPeerConnection(this.config ?? undefined);

        this.pc.onconnectionstatechange = (event) => {
            // Notify on connection state change 
            this.dispatchEvent(new CustomEvent("connection-change", { detail : this.pc?.connectionState }));
        };

        // Recover the data channel created by the Offerer/Creator
        this.pc.ondatachannel = (event) => {
            // Notify Data Channel Recovered
            this.dispatchEvent(new CustomEvent("datachannel-recovered", { detail : event.channel }));
        };

        // For the ice candidate part
        this.pc.onicecandidate = (event) => {
            // Recover the ice candidate and check it
            const iceCandidate : RTCIceCandidate | null = event.candidate;
            if (!iceCandidate){
                return;
            }

            if (!this.isOfferAnswerFinished) {
                // Add the ice candidate to the ICE candidate buffer
                this.iceCandidateBuffer.push(iceCandidate);
            } else {
                // Create the signaling message
                const msg : SignalingMessage = { type : "icecandidate", payload : JSON.stringify(iceCandidate) } as SignalingMessage;
                // Notify on signal generated
                this.notifySignalGenerated(msg);
            }
        };
    }

    private flushBuffer(){
        while ( this.iceCandidateBuffer.length > 0 ) {
            // try recover the ice candidate by poping buffer and make sure it returns an RTCIceCandidate
            const iceCandidate : RTCIceCandidate | undefined = this.iceCandidateBuffer.shift();
            if (!iceCandidate){
                return;
            }
            // Create the icecandidate message
            const msg : SignalingMessage = { type : "icecandidate", payload : JSON.stringify(iceCandidate) } as SignalingMessage;
            // Notify on signal generated
            this.notifySignalGenerated(msg);
        }
        // Update the isOfferAnswer flag 
        this.isOfferAnswerFinished = true;
    }

    async generateOffer(){
        // Create the data channel and abort if data channel couldn't been created
        const dc : RTCDataChannel | undefined = this.pc?.createDataChannel("file-transfer");
        if (!dc){
            this.dispatchEvent(new CustomEvent("dc-not-created"));
            return;
        }

        // Notify Data Channel Recovered
        this.dispatchEvent(new CustomEvent("datachannel-recovered", { detail : dc }));

        // Create offer and verifying if it is successfully created
        const offer : RTCSessionDescriptionInit | undefined = await this.pc?.createOffer();
        if (!offer){
            this.dispatchEvent(new CustomEvent("offer-creation-failed"));
            return;
        }

        // Set local description to the offer before sending
        await this.pc?.setLocalDescription(offer);

        // create the signaling message
        const msg : SignalingMessage = { type : "offer", payload : JSON.stringify(offer) } as SignalingMessage;

        // Notify on signal generated
        this.notifySignalGenerated(msg);
    }

    private async generateAnswer(offerPayload : RTCSessionDescriptionInit){
        // Set remote description to the offer
        await this.pc?.setRemoteDescription(offerPayload);

        // Create the answer and verifying if it is successfully created
        const answer : RTCSessionDescriptionInit | undefined = await this.pc?.createAnswer();
        if (!answer){
            this.dispatchEvent(new CustomEvent("answer-creation-failed"));
            return;
        }

        // Set the local description to the answer
        await this.pc?.setLocalDescription(answer);

        // Create the signaling message
        const msg : SignalingMessage = { type : "answer", payload : JSON.stringify(answer) } as SignalingMessage;

        // Notify on signal generated
        this.notifySignalGenerated(msg);
    }

    private notifySignalGenerated(message : SignalingMessage){
        this.dispatchEvent(new CustomEvent("signal-generated", { detail : message }));
    }

    async handleSignalingMessage(msg : SignalingMessage){
        // Here we do the steps of WebRTC Signaling
        switch(msg.type){
            case "offer":
                // Recover the Offer's Session Description Init
                const offer : RTCSessionDescriptionInit = JSON.parse(msg.payload) as RTCSessionDescriptionInit;
                await this.generateAnswer(offer);
                break;
            case "answer":
                // Recover the answer's SD
                const answer : RTCSessionDescriptionInit = JSON.parse(msg.payload) as RTCSessionDescriptionInit;
                // Set the remote SD
                await this.pc?.setRemoteDescription(answer);
                // Create the end of offer-answer step message
                const finishMsg : SignalingMessage = { type : "offer-answer-finish", payload : "" } as SignalingMessage;
                // Notify end of offer-answer step
                this.notifySignalGenerated(finishMsg);
                break;
            case "offer-answer-finish":
                // Flush the buffer
                this.flushBuffer();
                break;
            case "icecandidate":
                // Recover ice candidate
                const iceCandidate : RTCIceCandidate = JSON.parse(msg.payload) as RTCIceCandidate;
                // Add the ice candidate
                await this.pc?.addIceCandidate(iceCandidate);
                break;
            case "error":
                break;
            default:
                break;
        }
    }
}
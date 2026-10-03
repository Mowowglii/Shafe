import type { SignalingMessage } from "../types/sigmessage.js";
import { parseInto } from "../utils/parseHelper.js";

export class WebSocketService extends EventTarget{
    private ws : WebSocket | null = null;
    private pendingMessage : SignalingMessage[] = [];
    private reconnectTimer : number | null = null;
    private reconnectResetTimer : number | null = null;
    private reconnectAttempt : number = 0;
    private readonly maxReconnectAttempts : number = 5;
    private readonly reconnectDelayMs : number = 1000;
    private readonly stableConnectionMs : number = 30000; // 30s
    private isReconnecting : boolean = false;
    private isClosedByUser : boolean = false;
    private url : string = "";

    constructor(url : string){
        super();
        this.url = url;
        this.connect();
    }

    private connect(){
        // Check Valid Web Socket url
        if (!this.isValidWebSocketUrl(this.url)) {
            this.dispatchEvent(new CustomEvent("ws-error", {
                detail: { reason: "invalid-url-or-bad-protocol", url: this.url }
            }));
            return;
        }

        // Clean up existing instance before recreating
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
        }

        // Try create web socket and set listeners
        try {
            this.ws = new WebSocket(this.url);
        } catch {
            this.dispatchEvent(new CustomEvent("ws-error", {
                detail: { reason: "invalid-url-or-bad-protocol", url: this.url }
            }));
            return;
        }

        // OPEN
        this.ws.onopen = (event) => {
            // Update the reconnecting flag
            this.isReconnecting = false;
            
            // reset reconnect attempt only if connection is considered as stable
            if (this.reconnectAttempt > 0) {
                this.reconnectResetTimer = globalThis.setTimeout(() => {
                    this.reconnectAttempt = 0;
                    this.reconnectResetTimer = null;
                }, this.stableConnectionMs);
            }
            // flush pending message
            this.flushPending();
            // Notify on ws opened
            this.dispatchEvent(new CustomEvent("ws-opened"));
        };

        // CLOSE
        this.ws.onclose = (event) => {
            if (this.reconnectResetTimer !== null) {
                clearTimeout(this.reconnectResetTimer);
                this.reconnectResetTimer = null;
            }
            // check intentional close and close code
            if (!this.isClosedByUser && this.shouldRetryAfterClose(event)){
                // Schedule reconnect
                this.reconnect();
            }
            // Notify closed Web Socket
            this.dispatchEvent(new CustomEvent("ws-closed", {
                detail: {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean
                }
            }));
        };

        // ERROR
        this.ws.onerror = (event) => {
            // Notify on error
            this.dispatchEvent(new CustomEvent("ws-error", { detail : {reason : "connection-error", event} }));
        };

        // MESSAGE
        this.ws.onmessage = (event) => {
            // Add an event listener on the event generated to wire ws service and peer manager service
            this.handleSignal(event.data);
        };
    }

    sendSignal(msg: SignalingMessage) {
        // Pending message when ws is not instanciate or not ready
        if (!this.ws || this.ws.readyState === WebSocket.CONNECTING) {
            this.pendingMessage.push(msg);        
            // Notify on message not sent
            this.dispatchEvent(new CustomEvent("msg-not-sent", { detail: msg }));
            return;
        }

        // Directly send message when open
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
            // Notify on message sent
            this.dispatchEvent(new CustomEvent("msg-sent", { detail: msg }));
            return;
        }
    }

    private flushPending(){
        while (this.pendingMessage.length > 0){
            // recover message and verify recover success
            const msg : SignalingMessage | undefined = this.pendingMessage.shift();
            if (!msg){
                return;
            }

            // Send message
            this.sendSignal(msg);
        }
    }

    private isValidWebSocketUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === "ws:" || parsed.protocol === "wss:";
        } catch {
            return false;
        }
    }

    private shouldRetryAfterClose(event: CloseEvent): boolean {
        // abnormal closure, server not available, handshake rejected, socket died
        return event.code === 1006 || event.code === 1011 || !event.wasClean;
    }

    private reconnect(){
        // If already reconnecting or intentionally closed, abort
        if (this.isReconnecting || this.isClosedByUser){
            return;
        }

        // If reconnecting attemp exceed max attempt, abort
        if (this.reconnectAttempt >= this.maxReconnectAttempts){
            this.dispatchEvent(new CustomEvent("ws-error", {
                detail: { reason: "max-reconnect-attempts-reached" }
            }));
            return;
        }

        this.reconnectAttempt++;

        // Clear previous Schedule
        if (this.reconnectTimer !== null){
            clearTimeout(this.reconnectTimer);
        }

        // Update isReconnecting flag
        this.isReconnecting = true;
        
        // Schedule reconnect
        this.reconnectTimer = globalThis.setTimeout(() => {
            this.isReconnecting = false;
            this.connect();
        }, this.reconnectDelayMs * this.reconnectAttempt);
    }

    stop(){
        // Clear timeout
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.reconnectResetTimer !== null) {
            clearTimeout(this.reconnectResetTimer);
        }
        // Reset Timer
        this.reconnectTimer = null;
        this.reconnectResetTimer = null;
        // Reset reconnecting
        this.isReconnecting = false;
        // Update isClosedByUser flag
        this.isClosedByUser = true;
        // Close Web Socket
        this.ws?.close();
    }

    restart(url? : string) {
        if (this.reconnectResetTimer !== null) {
            clearTimeout(this.reconnectResetTimer);
        }
        this.reconnectResetTimer = null;
        // Change url if set in parameter
        if (url) {
            this.url = url;
        }
        // Reset every flag
        this.isClosedByUser = false;
        this.isReconnecting = false;
        this.reconnectAttempt = 0;

        // Close current web socket if still running
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            this.ws.close();
        }
        this.connect();
    }

    private handleSignal(data : string){
        // recover the message from data and if it fails inject a signal message with error type
        let msg : SignalingMessage = parseInto(data, { type : "error", payload : "" });
        
        if (msg.type === "error"){
            // Notify on error
            this.dispatchEvent(new CustomEvent("error-in-data"));
            return;
        }
        // Notify on signal received with the message in details
        this.dispatchEvent(new CustomEvent("signal-received", { detail : msg }));
    }
}
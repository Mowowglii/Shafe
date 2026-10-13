import { PeerManagerService } from "./signaling/pm.service.js";
import { WebSocketService } from "./signaling/ws.service.js";
import type { SignalingMessage } from "./types/sigmessage.js";
import { FileTransferManager } from "./webrtc/filetransfer.manager.js";

export type ConnectionRole = "initiator" | "recipient";

export class ConnectionManager extends EventTarget {
    private readonly peerManager: PeerManagerService;
    private readonly fileTransferManager: FileTransferManager;
    private readonly webSocketService: WebSocketService;
    private signalingQueue: Promise<void> = Promise.resolve();
    private role: ConnectionRole;
    private offerStarted = false;
    private waitingForReplacementPeer = false;
    private peerConnected = false;
    private dataChannelOpen = false;
    private isClosed = false;

    constructor(roomId: string, role: ConnectionRole, rtcConfiguration: RTCConfiguration = {}) {
        super();
        this.role = role;
        this.peerManager = new PeerManagerService(rtcConfiguration);
        this.fileTransferManager = new FileTransferManager();
        this.bindPeerManager();
        this.bindFileTransferManager();

        const signalingUrl = new URL("/signal", window.location.origin);
        signalingUrl.protocol = signalingUrl.protocol === "https:" ? "wss:" : "ws:";
        signalingUrl.searchParams.set("roomId", roomId);
        this.webSocketService = new WebSocketService(signalingUrl.toString());
        this.bindWebSocketService();
    }

    sendFile(file: File, transferId: string): void {
        this.fileTransferManager.sendFile(file, transferId);
    }

    cancelTransfer(transferId: string): void {
        this.fileTransferManager.cancelTransfer(transferId);
    }

    close(): void {
        if (this.isClosed) {
            return;
        }
        this.isClosed = true;
        this.webSocketService.stop();
        this.fileTransferManager.close();
        this.peerManager.close();
    }

    leaveRoom(): void {
        this.webSocketService.leaveRoom();
        this.close();
    }

    private bindPeerManager(): void {
        this.peerManager.addEventListener("signal-generated", (event) => {
            this.webSocketService.sendSignal((event as CustomEvent<SignalingMessage>).detail);
        });
        this.peerManager.addEventListener("datachannel-recovered", (event) => {
            this.fileTransferManager.bindDataChannel((event as CustomEvent<RTCDataChannel>).detail);
        });
        this.peerManager.addEventListener("connection-change", (event) => {
            if (this.isClosed) {
                return;
            }
            const state = (event as CustomEvent<RTCPeerConnectionState>).detail;
            this.peerConnected = state === "connected";
            this.dispatchEvent(new CustomEvent("connection-state", { detail: state }));
        });
        for (const eventName of [
            "dc-not-created",
            "offer-creation-failed",
            "answer-creation-failed",
        ]) {
            this.peerManager.addEventListener(eventName, () => {
                this.dispatchEvent(new CustomEvent("connection-error", {
                    detail: { reason: eventName },
                }));
            });
        }
    }

    private bindFileTransferManager(): void {
        this.fileTransferManager.addEventListener("data-channel-open", () => {
            this.dataChannelOpen = true;
            this.dispatchEvent(new CustomEvent("data-channel-open"));
        });
        this.fileTransferManager.addEventListener("data-channel-closed", () => {
            this.dataChannelOpen = false;
            this.dispatchEvent(new CustomEvent("data-channel-closed"));
        });
        for (const eventName of [
            "file-received",
            "file-send-complete",
            "file-send-progress",
            "file-receive-progress",
            "file-transfer-cancelled",
            "file-transfer-error",
            "data-channel-error",
        ]) {
            this.fileTransferManager.addEventListener(eventName, (event) => {
                const detail = (event as CustomEvent<unknown>).detail;
                this.dispatchEvent(new CustomEvent(eventName, { detail }));
            });
        }
    }

    private bindWebSocketService(): void {
        this.webSocketService.addEventListener("ws-opened", () => {
            this.dispatchEvent(new CustomEvent("signaling-open"));
            this.webSocketService.sendSignal({
                type: "peer-ready",
                payload: this.role,
            });
        });
        this.webSocketService.addEventListener("signal-received", (event) => {
            const message = (event as CustomEvent<SignalingMessage>).detail;
            if (message.type === "peer-ready") {
                if (this.role === "initiator" && message.payload === "recipient") {
                    if (this.waitingForReplacementPeer) {
                        this.peerManager.restart();
                        this.waitingForReplacementPeer = false;
                    }
                    this.startOffer();
                } else if (this.role === "recipient" && message.payload === "initiator") {
                    this.webSocketService.sendSignal({ type: "peer-ready", payload: this.role });
                }
                return;
            }
            if (message.type === "peer-left") {
                this.promoteToInitiator();
                return;
            }
            this.signalingQueue = this.signalingQueue
                .then(() => this.peerManager.handleSignalingMessage(message))
                .catch((error: unknown) => this.reportError("signaling", error));
        });
        this.webSocketService.addEventListener("ws-error", (event) => {
            this.dispatchEvent(new CustomEvent("connection-error", {
                detail: (event as CustomEvent<unknown>).detail,
            }));
        });
        this.webSocketService.addEventListener("room-rejected", (event) => {
            this.dispatchEvent(new CustomEvent("room-rejected", {
                detail: (event as CustomEvent<unknown>).detail,
            }));
        });
        this.webSocketService.addEventListener("room-expired", (event) => {
            this.dispatchEvent(new CustomEvent("room-expired", {
                detail: (event as CustomEvent<unknown>).detail,
            }));
        });
        this.webSocketService.addEventListener("error-in-data", () => {
            this.dispatchEvent(new CustomEvent("connection-error", {
                detail: { reason: "Invalid signaling message received" },
            }));
        });
        this.webSocketService.addEventListener("room-expiring", (event) => {
            this.dispatchEvent(new CustomEvent("room-expiring", {
                detail: (event as CustomEvent<unknown>).detail,
            }));
        });
    }

    private startOffer(): void {
        if (this.offerStarted) {
            return;
        }
        this.offerStarted = true;
        void this.peerManager.generateOffer().catch((error: unknown) => {
            this.reportError("offer", error);
        });
    }

    private promoteToInitiator(): void {
        if (this.isClosed) {
            return;
        }
        this.role = "initiator";
        this.offerStarted = false;
        this.waitingForReplacementPeer = true;
        this.peerConnected = false;
        this.dataChannelOpen = false;
        this.dispatchEvent(new CustomEvent("role-promoted", { detail: this.role }));
    }

    private reportError(operation: string, error: unknown): void {
        const reason = error instanceof Error ? error.message : String(error);
        this.dispatchEvent(new CustomEvent("connection-error", {
            detail: { operation, reason },
        }));
    }
}

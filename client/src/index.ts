import { ConnectionManager, type ConnectionRole } from "./connectionmanager.js";
import type { FileTransferResponse } from "./types/filehandling.js";
import type { ReceivedFile } from "./webrtc/filetransfer.manager.js";
import "./style.css";

type RoomResponse = { roomId: string; role: string };

const setupView = getElement<HTMLElement>("setup-view");
const transferView = getElement<HTMLElement>("transfer-view");
const createRoomButton = getElement<HTMLButtonElement>("create-room-btn");
const copyRoomIdButton = getElement<HTMLButtonElement>("copy-room-id-btn");
const copyRoomIdStatus = getElement<HTMLElement>("copy-room-id-status");
const joinRoomForm = getElement<HTMLFormElement>("join-room-form");
const roomIdInput = getElement<HTMLInputElement>("room-id-input");
const currentRoomId = getElement<HTMLElement>("current-room-id");
const connectionStatus = getElement<HTMLElement>("connection-status");
const fileInput = getElement<HTMLInputElement>("file-input");
const sendFileButton = getElement<HTMLButtonElement>("send-file-btn");
const progressBar = getElement<HTMLProgressElement>("progress-bar");
const receivedFiles = getElement<HTMLUListElement>("received-files");
const peerDisconnectNotice = getElement<HTMLElement>("peer-disconnect-notice");
const leaveRoomButton = getElement<HTMLButtonElement>("leave-room-btn");
const appError = getElement<HTMLElement>("app-error");

let connectionManager: ConnectionManager | null = null;
let peerConnected = false;
let dataChannelOpen = false;
const receivedObjectUrls: string[] = [];

createRoomButton.addEventListener("click", () => {
    void createRoom();
});

joinRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void joinRoom(roomIdInput.value.trim());
});

fileInput.addEventListener("change", () => {
    sendFileButton.disabled = !connectionManager || !fileInput.files?.[0];
});

sendFileButton.addEventListener("click", () => {
    const file = fileInput.files?.[0];
    if (!connectionManager || !file) {
        return;
    }
    try {
        progressBar.value = 0;
        connectionManager.sendFile(file);
        sendFileButton.disabled = true;
        setStatus(`Sending ${file.name}…`);
    } catch (error) {
        showError(error);
    }
});

leaveRoomButton.addEventListener("click", returnToSetup);

copyRoomIdButton.addEventListener("click", () => {
    void copyRoomId();
});

window.addEventListener("beforeunload", () => connectionManager?.close());

async function createRoom(): Promise<void> {
    setSetupBusy(true);
    clearError();
    try {
        const response = await fetch("/api/rooms", { method: "POST" });
        if (!response.ok) {
            throw new Error(`Could not create a room (HTTP ${response.status})`);
        }
        const room = await readRoomResponse(response);
        await startConnection(room.roomId, "initiator");
    } catch (error) {
        setSetupBusy(false);
        showError(error);
    }
}

async function joinRoom(roomId: string): Promise<void> {
    if (!roomId) {
        showError(new Error("Enter a room ID to join"));
        return;
    }
    setSetupBusy(true);
    clearError();
    try {
        await startConnection(roomId, "recipient");
    } catch (error) {
        setSetupBusy(false);
        showError(error);
    }
}

async function startConnection(roomId: string, role: ConnectionRole): Promise<void> {
    if (!("RTCPeerConnection" in window) || !("Worker" in window)) {
        throw new Error("This browser does not support WebRTC data channels and workers");
    }
    connectionManager?.close();
    connectionManager = new ConnectionManager(roomId, role, {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnected = false;
    dataChannelOpen = false;
    currentRoomId.textContent = roomId;
    copyRoomIdStatus.textContent = "";
    peerDisconnectNotice.hidden = true;
    peerDisconnectNotice.textContent = "";
    setupView.hidden = true;
    transferView.hidden = false;
    setStatus("Connecting to the signaling server…");

    connectionManager.addEventListener("signaling-open", () => {
        setStatus("Signaling connected; waiting for the other peer…");
    });
    connectionManager.addEventListener("connection-state", (event) => {
        const state = (event as CustomEvent<RTCPeerConnectionState>).detail;
        peerConnected = state === "connected";
        if (state === "connecting") {
            setStatus("Establishing peer-to-peer connection…");
        } else if (state === "disconnected" || state === "failed" || state === "closed") {
            dataChannelOpen = false;
            sendFileButton.disabled = true;
            const message = state === "disconnected"
                ? "The peer connection was interrupted. It may recover automatically."
                : `The peer connection ${state}.`;
            setStatus(message);
            peerDisconnectNotice.textContent = `${message} Leave the room to return to the main screen.`;
            peerDisconnectNotice.hidden = false;
        } else if (peerConnected && dataChannelOpen) {
            sendFileButton.disabled = !fileInput.files?.[0];
            setStatus("Peer-to-peer connection restored");
            peerDisconnectNotice.hidden = true;
        }
    });
    connectionManager.addEventListener("data-channel-open", () => {
        dataChannelOpen = true;
        if (peerConnected) {
            sendFileButton.disabled = !fileInput.files?.[0];
            setStatus("Peer-to-peer data channel ready");
            peerDisconnectNotice.hidden = true;
        }
    });
    connectionManager.addEventListener("signaling-closed", () => {
        setStatus("Peer-to-peer connection ready; signaling disconnected");
    });
    connectionManager.addEventListener("data-channel-closed", () => {
        dataChannelOpen = false;
        sendFileButton.disabled = true;
        setStatus("Peer-to-peer data channel closed");
        peerDisconnectNotice.textContent = "The peer closed the transfer connection. Leave the room to return to the main screen.";
        peerDisconnectNotice.hidden = false;
    });
    connectionManager.addEventListener("room-expiring", (event) => {
        const seconds = (event as CustomEvent<{ secondsRemaining: number }>).detail.secondsRemaining;
        setStatus(`Signaling room expires in ${seconds} seconds`);
    });
    connectionManager.addEventListener("connection-error", (event) => {
        const detail = (event as CustomEvent<{ operation?: string; reason?: string }>).detail;
        showError(new Error([detail.operation, detail.reason].filter(Boolean).join(": ") || "Connection failed"));
    });
    connectionManager.addEventListener("file-transfer-error", (event) => {
        const detail = (event as CustomEvent<{ operation?: string; reason?: string }>).detail;
        showError(new Error([detail.operation, detail.reason].filter(Boolean).join(": ") || "File transfer failed"));
        sendFileButton.disabled = !fileInput.files?.[0];
    });
    connectionManager.addEventListener("file-send-progress", (event) => {
        const detail = (event as CustomEvent<Extract<FileTransferResponse, { type: "file-send-progress" }>>).detail;
        progressBar.max = Math.max(detail.totalChunks, 1);
        progressBar.value = detail.sentChunks;
    });
    connectionManager.addEventListener("file-send-complete", (event) => {
        const detail = (event as CustomEvent<Extract<FileTransferResponse, { type: "file-send-complete" }>>).detail;
        setStatus(`${detail.fileName} sent`);
        sendFileButton.disabled = !fileInput.files?.[0];
    });
    connectionManager.addEventListener("file-received", (event) => {
        addReceivedFile((event as CustomEvent<ReceivedFile>).detail);
    });
}

async function readRoomResponse(response: Response): Promise<RoomResponse> {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("roomId" in body) || !("role" in body)
        || typeof body.roomId !== "string" || typeof body.role !== "string"
        || body.role !== "initiator") {
        throw new Error("The server returned an invalid room response");
    }
    return { roomId: body.roomId, role: body.role };
}

function addReceivedFile(file: ReceivedFile): void {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file.blob);
    receivedObjectUrls.push(link.href);
    link.download = file.metadata.fileName;
    link.textContent = `${file.metadata.fileName} (${formatBytes(file.metadata.fileSize)})`;
    const listItem = document.createElement("li");
    listItem.append(link);
    receivedFiles.append(listItem);
    setStatus(`Received ${file.metadata.fileName}`);
}

function returnToSetup(): void {
    connectionManager?.close();
    connectionManager = null;
    peerConnected = false;
    dataChannelOpen = false;
    for (const objectUrl of receivedObjectUrls.splice(0)) {
        URL.revokeObjectURL(objectUrl);
    }
    receivedFiles.replaceChildren();
    fileInput.value = "";
    roomIdInput.value = "";
    sendFileButton.disabled = true;
    progressBar.value = 0;
    progressBar.max = 100;
    currentRoomId.textContent = "";
    copyRoomIdStatus.textContent = "";
    peerDisconnectNotice.hidden = true;
    peerDisconnectNotice.textContent = "";
    clearError();
    setStatus("Disconnected");
    transferView.hidden = true;
    setupView.hidden = false;
    setSetupBusy(false);
}

async function copyRoomId(): Promise<void> {
    const roomId = currentRoomId.textContent?.trim();
    if (!roomId) {
        showError(new Error("There is no room ID to copy"));
        return;
    }
    try {
        await navigator.clipboard.writeText(roomId);
        copyRoomIdStatus.textContent = "Room ID copied";
    } catch (error) {
        showError(new Error(
            `Could not copy the room ID: ${error instanceof Error ? error.message : String(error)}`,
        ));
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function setSetupBusy(busy: boolean): void {
    createRoomButton.disabled = busy;
    getElement<HTMLButtonElement>("join-room-btn").disabled = busy;
}

function setStatus(message: string): void {
    connectionStatus.textContent = message;
}

function showError(error: unknown): void {
    appError.textContent = error instanceof Error ? error.message : String(error);
    appError.hidden = false;
}

function clearError(): void {
    appError.textContent = "";
    appError.hidden = true;
}

function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Required UI element #${id} is missing`);
    }
    return element as T;
}

import { ConnectionManager, type ConnectionRole } from "./connectionmanager.js";
import type { FileTransferResponse } from "./types/filehandling.js";
import type { ReceivedFile } from "./webrtc/filetransfer.manager.js";
import "@fontsource-variable/inter";
import "./style.css";

type RoomResponse = { roomId: string; role: string };

const introReveal = document.getElementById("intro-reveal");
const introExitPanel = introReveal?.querySelector(".intro-panel--right");
if (introReveal && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    introReveal.remove();
} else if (introReveal && introExitPanel) {
    introExitPanel.addEventListener("animationend", () => introReveal.remove(), { once: true });
}

const setupView = getElement<HTMLElement>("setup-view");
const transferView = getElement<HTMLElement>("transfer-view");
const appShell = getElement<HTMLElement>("app-shell");
const createRoomButton = getElement<HTMLButtonElement>("create-room-btn");
const copyRoomIdButton = getElement<HTMLButtonElement>("copy-room-id-btn");
const copyRoomIdStatus = getElement<HTMLElement>("copy-room-id-status");
const joinRoomForm = getElement<HTMLFormElement>("join-room-form");
const roomIdInput = getElement<HTMLInputElement>("room-id-input");
const currentRoomId = getElement<HTMLElement>("current-room-id");
const connectionStatus = getElement<HTMLElement>("connection-status");
const connectionJournalList = getElement<HTMLOListElement>("connection-journal-list");
const connectionJournalContent = getElement<HTMLElement>("connection-journal-content");
const toggleConnectionEventsButton = getElement<HTMLButtonElement>("toggle-connection-events-btn");
const fileInput = getElement<HTMLInputElement>("file-input");
const sendFileButton = getElement<HTMLButtonElement>("send-file-btn");
const transferList = getElement<HTMLElement>("transfer-list");
const peerDisconnectNotice = getElement<HTMLElement>("peer-disconnect-notice");
const leaveRoomButton = getElement<HTMLButtonElement>("leave-room-btn");
const appError = getElement<HTMLElement>("app-error");

let connectionManager: ConnectionManager | null = null;
let peerConnected = false;
let dataChannelOpen = false;
type TransferRow = {
    container: HTMLLIElement;
    progress: HTMLProgressElement;
    complete: HTMLElement;
    label: HTMLElement;
    status: HTMLElement;
    cancel: HTMLButtonElement | null;
    journalAnnounced: boolean;
}
const transferRows = new Map<string, TransferRow>();
const receivedObjectUrls: string[] = [];

toggleConnectionEventsButton.addEventListener("click", () => {
    const expanded = toggleConnectionEventsButton.getAttribute("aria-expanded") === "true";
    toggleConnectionEventsButton.setAttribute("aria-expanded", String(!expanded));
    toggleConnectionEventsButton.setAttribute(
        "aria-label",
        expanded ? "Show connection events" : "Hide connection events",
    );
    toggleConnectionEventsButton.title = expanded ? "Show connection events" : "Hide connection events";
    connectionJournalContent.hidden = expanded;
});

createRoomButton.addEventListener("click", () => {
    void createRoom();
});

joinRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void joinRoom(roomIdInput.value.trim());
});

fileInput.addEventListener("change", () => {
    updateSendFileButton();
});

sendFileButton.addEventListener("click", () => {
    const files = Array.from(fileInput.files ?? []);
    if (!connectionManager || files.length === 0) {
        return;
    }
    for (const file of files) {
        const transferId = crypto.randomUUID();
        createTransferRow(transferId, file.name, "send");
        try {
            connectionManager.sendFile(file, transferId);
            setStatus(`Sending ${file.name}…`);
        } catch (error) {
            transferRows.get(transferId)?.container.remove();
            transferRows.delete(transferId);
            showError(error);
        }
    }
    fileInput.value = "";
    updateSendFileButton();
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
    clearTransferRows();
    connectionJournalList.replaceChildren();
    currentRoomId.textContent = roomId;
    copyRoomIdStatus.textContent = "";
    peerDisconnectNotice.hidden = true;
    peerDisconnectNotice.textContent = "";
    setupView.hidden = true;
    transferView.hidden = false;
    appShell.className = "app-shell app-shell--transfer";
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
            updateSendFileButton();
            const message = state === "disconnected"
                ? "The peer connection was interrupted. It may recover automatically."
                : `The peer connection ${state}.`;
            setStatus(message);
            peerDisconnectNotice.textContent = `${message} Leave the room to return to the main screen.`;
            peerDisconnectNotice.hidden = false;
        } else if (peerConnected && dataChannelOpen) {
            updateSendFileButton();
            setStatus("Peer-to-peer connection restored");
            peerDisconnectNotice.hidden = true;
            clearError();
        }
    });
    connectionManager.addEventListener("data-channel-open", () => {
        dataChannelOpen = true;
        if (peerConnected) {
            updateSendFileButton();
            setStatus("Peer-to-peer data channel ready");
            peerDisconnectNotice.hidden = true;
            clearError();
        }
    });
    connectionManager.addEventListener("signaling-closed", () => {
        setStatus("Peer-to-peer connection ready; signaling disconnected");
    });
    connectionManager.addEventListener("data-channel-closed", () => {
        dataChannelOpen = false;
        updateSendFileButton();
        setStatus("Peer-to-peer data channel closed");
        peerDisconnectNotice.textContent = "The peer closed the transfer connection. Leave the room to return to the main screen.";
        peerDisconnectNotice.hidden = false;
    });
    connectionManager.addEventListener("room-expiring", (event) => {
        const seconds = (event as CustomEvent<{ secondsRemaining: number }>).detail.secondsRemaining;
        setStatus(`Signaling room expires in ${seconds} seconds`);
    });
    connectionManager.addEventListener("room-rejected", (event) => {
        const detail = (event as CustomEvent<{ message: string }>).detail;
        const attemptedRoomId = currentRoomId.textContent?.trim() ?? "";
        returnToSetup();
        roomIdInput.value = attemptedRoomId;
        showError(new Error(detail.message));
    });
    connectionManager.addEventListener("connection-error", (event) => {
        const detail = (event as CustomEvent<{ operation?: string; reason?: string }>).detail;
        showError(new Error([detail.operation, detail.reason].filter(Boolean).join(": ") || "Connection failed"));
    });
    connectionManager.addEventListener("file-transfer-error", (event) => {
        const detail = (event as CustomEvent<{ operation?: string; reason?: string }>).detail;
        showError(new Error([detail.operation, detail.reason].filter(Boolean).join(": ") || "File transfer failed"));
        updateSendFileButton();
    });
    connectionManager.addEventListener("file-send-progress", (event) => {
        const detail = (event as CustomEvent<Extract<FileTransferResponse, { type: "file-send-progress" }>>).detail;
        const row = ensureTransferRow(detail.transferId, detail.fileName, "send");
        row.progress.max = Math.max(detail.totalChunks, 1);
        row.progress.value = detail.sentChunks;
    });
    connectionManager.addEventListener("file-receive-progress", (event) => {
        const detail = (event as CustomEvent<Extract<FileTransferResponse, { type: "file-receive-progress" }>>).detail;
        const row = ensureTransferRow(detail.transferId, detail.fileName, "receive");
        row.progress.hidden = false;
        row.complete.hidden = true;
        row.progress.max = Math.max(detail.totalChunks, 1);
        row.progress.value = detail.receivedChunks;
        row.status.textContent = `Receiving ${detail.fileName}…`;
        if (!row.journalAnnounced) {
            row.journalAnnounced = true;
            setStatus(`Receiving ${detail.fileName}…`);
        }
    });
    connectionManager.addEventListener("file-transfer-cancelled", (event) => {
        const detail = (event as CustomEvent<Extract<FileTransferResponse, { type: "file-transfer-cancelled" }>>).detail;
        const row = ensureTransferRow(detail.transferId, detail.fileName, "receive");
        row.progress.hidden = true;
        row.complete.hidden = true;
        row.cancel?.remove();
        row.status.textContent = `Transfer cancelled: ${detail.fileName}`;
        setStatus(`Transfer cancelled: ${detail.fileName}`);
        updateSendFileButton();
    });
    connectionManager.addEventListener("file-send-complete", (event) => {
        const detail = (event as CustomEvent<Extract<FileTransferResponse, { type: "file-send-complete" }>>).detail;
        const row = ensureTransferRow(detail.transferId, detail.fileName, "send");
        row.progress.value = row.progress.max;
        row.progress.hidden = true;
        row.complete.hidden = false;
        row.label.textContent = `Transfer complete: ${detail.fileName}`;
        row.status.textContent = `Transfer complete: ${detail.fileName}`;
        row.cancel?.remove();
        setStatus(`File transfer completed: ${detail.fileName}`);
        updateSendFileButton();
    });
    connectionManager.addEventListener("file-received", (event) => {
        const file = (event as CustomEvent<ReceivedFile>).detail;
        const row = ensureTransferRow(file.metadata.transferId, file.metadata.fileName, "receive");
        row.progress.hidden = true;
        row.complete.hidden = false;
        const downloadLink = addReceivedFile(file);
        row.label.replaceChildren(
            document.createTextNode("Received: "),
            downloadLink.cloneNode(true),
        );
        row.status.textContent = `Received ${file.metadata.fileName}`;
        setStatus(`Received ${file.metadata.fileName}`);
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

function addReceivedFile(file: ReceivedFile): HTMLAnchorElement {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file.blob);
    receivedObjectUrls.push(link.href);
    link.download = file.metadata.fileName;
    link.textContent = `${file.metadata.fileName} (${formatBytes(file.metadata.fileSize)})`;
    return link;
}

function ensureTransferRow(transferId: string, fileName: string, direction: "send" | "receive"): TransferRow {
    const existing = transferRows.get(transferId);
    if (existing) {
        return existing;
    }
    return createTransferRow(transferId, fileName, direction);
}

function createTransferRow(transferId: string, fileName: string, direction: "send" | "receive"): TransferRow {
    const container = document.createElement("li");
    container.className = "transfer-item";
    container.dataset.transferId = transferId;
    container.dataset.direction = direction;

    const heading = document.createElement("strong");
    heading.className = "transfer-file-name";
    heading.textContent = fileName;

    const progress = document.createElement("progress");
    progress.value = 0;
    progress.max = 100;
    progress.setAttribute("aria-label", `Transfer progress for ${fileName}`);

    const complete = document.createElement("span");
    complete.className = "transfer-complete";
    complete.setAttribute("role", "status");
    complete.hidden = true;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
    check.setAttribute("d", "m5 12 4 4L19 6");
    icon.append(check);
    const label = document.createElement("span");
    label.className = "transfer-complete-label";
    complete.append(icon, label);

    const status = document.createElement("span");
    status.className = "transfer-status";
    status.textContent = direction === "send" ? `Sending ${fileName}…` : `Receiving ${fileName}…`;

    let cancel: HTMLButtonElement | null = null;
    if (direction === "send") {
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = "Cancel transfer";
        cancelButton.addEventListener("click", () => {
            if (!connectionManager) {
                return;
            }
            cancelButton.disabled = true;
            cancelButton.textContent = "Cancelling…";
            connectionManager.cancelTransfer(transferId);
        });
        cancel = cancelButton;
    }

    container.append(heading, status, progress, complete);
    if (cancel) {
        container.append(cancel);
    }
    transferList.append(container);
    const row = { container, progress, complete, label, status, cancel, journalAnnounced: direction === "send" };
    transferRows.set(transferId, row);
    return row;
}

function clearTransferRows(): void {
    transferRows.clear();
    transferList.replaceChildren();
}

function returnToSetup(): void {
    connectionManager?.close();
    connectionManager = null;
    peerConnected = false;
    dataChannelOpen = false;
    for (const objectUrl of receivedObjectUrls.splice(0)) {
        URL.revokeObjectURL(objectUrl);
    }
    fileInput.value = "";
    roomIdInput.value = "";
    sendFileButton.disabled = true;
    clearTransferRows();
    currentRoomId.textContent = "";
    copyRoomIdStatus.textContent = "";
    peerDisconnectNotice.hidden = true;
    peerDisconnectNotice.textContent = "";
    clearError();
    setStatus("Disconnected");
    transferView.hidden = true;
    setupView.hidden = false;
    appShell.className = "app-shell app-shell--setup";
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

function updateSendFileButton(): void {
    sendFileButton.disabled = !connectionManager
        || !peerConnected
        || !dataChannelOpen
        || !fileInput.files?.length;
}

function setStatus(message: string): void {
    connectionStatus.textContent = message;
    const lastEntry = connectionJournalList.lastElementChild;
    if (lastEntry?.getAttribute("data-message") !== message) {
        const item = document.createElement("li");
        item.dataset.message = message;
        const timestamp = new Date();
        const time = document.createElement("time");
        time.dateTime = timestamp.toISOString();
        time.textContent = timestamp.toLocaleTimeString();
        const entryMessage = document.createElement("span");
        entryMessage.textContent = message;
        item.append(time, entryMessage);
        connectionJournalList.append(item);
        if (connectionJournalList.childElementCount > 100) {
            connectionJournalList.firstElementChild?.remove();
        }
        connectionJournalList.scrollTop = connectionJournalList.scrollHeight;
    }
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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Server, WebSocket as MockWebSocket } from "mock-socket";
import { WebSocketService } from "../../src/signaling/ws.service";
import type { SignalingMessage } from "../../src/types/sigmessage";

describe("WebSocketService", () => {
  const WS_URL = "ws://localhost:8080";
  let mockServer: Server;
  let service: WebSocketService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockServer = new Server(WS_URL);
    vi.stubGlobal("WebSocket", MockWebSocket);
    service = new WebSocketService(WS_URL);
  });

  afterEach(() => {
    if (service) {
      service.stop();
    }
    mockServer.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("Connection Initialization", () => {
    it("should open connection successfully and dispatch ws-opened event", async () => {
      const openedPromise = new Promise<boolean>((resolve) => {
        service.addEventListener("ws-opened", () => resolve(true), { once: true });
      });

      vi.advanceTimersByTime(50);
      const isOpened = await openedPromise;

      expect(isOpened).toBe(true);
    });

    it("should dispatch ws-error on invalid URL protocol", () => {
      let errorDetail: any = null;

      const invalidService = new WebSocketService(WS_URL);

      invalidService.addEventListener("ws-error", (e: Event) => {
        errorDetail = (e as CustomEvent).detail;
      });

      invalidService.restart("http://localhost:8080");

      expect(errorDetail).toEqual({
        reason: "invalid-url-or-bad-protocol",
        url: "http://localhost:8080",
      });

      invalidService.stop();
    });
  });

  describe("Sending Messages", () => {
    it("should queue message when CONNECTING and dispatch msg-not-sent", () => {
      let msgNotSentDetail: any = null;
      const testMsg: SignalingMessage = { type: "offer" as any, payload: "test" };

      service.addEventListener("msg-not-sent", (e: Event) => {
        msgNotSentDetail = (e as CustomEvent).detail;
      });

      service.sendSignal(testMsg);

      expect(msgNotSentDetail).toEqual(testMsg);
    });

    it("should send message directly when OPEN and flush queued pending messages", async () => {
      const msg1: SignalingMessage = { type: "offer" as any, payload: "first" };
      const msg2: SignalingMessage = { type: "answer" as any, payload: "second" };
      const receivedServerMsgs: string[] = [];

      mockServer.on("connection", (socket) => {
        socket.on("message", (data) => {
          receivedServerMsgs.push(data as string);
        });
      });

      const openedPromise = new Promise<void>((resolve) => {
        service.addEventListener("ws-opened", () => resolve(), { once: true });
      });

      service.sendSignal(msg1);

      vi.advanceTimersByTime(50);
      await openedPromise;

      service.sendSignal(msg2);

      vi.advanceTimersByTime(10);

      expect(receivedServerMsgs).toEqual([
        JSON.stringify(msg1),
        JSON.stringify(msg2),
      ]);
    });
  });

  describe("Receiving Messages", () => {
    it("should dispatch signal-received when valid data is received from server", async () => {
      const incomingMsg: SignalingMessage = { type: "candidate" as any, payload: "ice-candidate-data" };
      let receivedMsg: SignalingMessage | null = null;

      service.addEventListener("signal-received", (e: Event) => {
        receivedMsg = (e as CustomEvent).detail;
      });

      mockServer.on("connection", (socket) => {
        socket.send(JSON.stringify(incomingMsg));
      });

      vi.advanceTimersByTime(50);

      expect(receivedMsg).toEqual(incomingMsg);
    });

    it("should dispatch error-in-data when server sends unparseable or error payload", async () => {
      let errorDispatched = false;

      service.addEventListener("error-in-data", () => {
        errorDispatched = true;
      });

      mockServer.on("connection", (socket) => {
        socket.send("INVALID_JSON_DATA");
      });

      vi.advanceTimersByTime(50);

      expect(errorDispatched).toBe(true);
    });
  });

  describe("Reconnection & Lifecycle", () => {
    it("should attempt reconnection when closed abnormally", async () => {
        let closedDetail: any = null;

        service.addEventListener("ws-closed", (e: Event) => {
            closedDetail = (e as CustomEvent).detail;
        });

        // 1. Advance timer to complete initial handshake
        vi.advanceTimersByTime(50);

        // Store reference to initial socket
        const initialClient = mockServer.clients()[0];

        // 2. Trigger abnormal close from server
        initialClient.close({ code: 1006, reason: "Abnormal Closure", wasClean: false });

        // Process close event microtask
        vi.advanceTimersByTime(10);

        expect(closedDetail).toEqual({
            code: 1006,
            reason: "Abnormal Closure",
            wasClean: false,
        });

        // 3. Advance reconnect timer (1000ms * 1st attempt) + connection time (50ms)
        vi.advanceTimersByTime(1050);

        // Verify a new socket instance was created and reconnected
        const newClient = mockServer.clients()[0];
        expect(newClient).toBeDefined();
        expect(newClient).not.toBe(initialClient);
        });

    it("should stop reconnecting and not retry when stop() is called explicitly", () => {
        // 1. Complete initial handshake
        vi.advanceTimersByTime(50);
        expect(mockServer.clients().length).toBe(1);

        // 2. Stop the service (triggers this.ws.close())
        service.stop();

        // 3. Process close event microtask
        vi.advanceTimersByTime(10);

        // 4. Advance time past potential reconnect delays to ensure no new attempt is scheduled
        vi.advanceTimersByTime(5000);

        // Active client count should remain 0
        expect(mockServer.clients().length).toBe(0);
        });

    it("should limit reconnect attempts to maxReconnectAttempts", async () => {
      let connectionAttempts = 0;
      let maxAttemptsReached = 0;

      mockServer.on("connection", (socket) => {
        connectionAttempts++;
        socket.close({
          code: 1011,
          reason: "Connection failed",
          wasClean: false,
        });
      });

      service.addEventListener("ws-error", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.reason === "max-reconnect-attempts-reached") {
          maxAttemptsReached++;
        }
      });

      await vi.runAllTimersAsync();

      expect(connectionAttempts).toBe(6);
      expect(maxAttemptsReached).toBe(1);
    });

    it("should allow restarting service with a new URL", async () => {
      const NEW_WS_URL = "ws://localhost:9090";
      const newMockServer = new Server(NEW_WS_URL);

      vi.advanceTimersByTime(50);

      service.restart(NEW_WS_URL);

      vi.advanceTimersByTime(50);

      expect(newMockServer.clients().length).toBe(1);

      newMockServer.stop();
    });
  });
});
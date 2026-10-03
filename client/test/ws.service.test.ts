import {describe, it, expect, beforeEach, afterEach, vi, afterAll} from "vitest";
import {Server, WebSocket as MockWebSocket} from "mock-socket";
import { WebSocketService } from "../src/signaling/ws.service";

describe("WebSocketService", () => {
    const WS_URL = "ws://localhost:8080";
    let mockServer : Server;
    let service : WebSocketService;

    beforeEach(() => {
        // 1. On créer le serveur de test
        mockServer = new Server(WS_URL);

        // 2. On remplace l'implementation globale de websocket par un websocket test
        vi.stubGlobal("WebSocket", MockWebSocket);

        // 3. On créer l'instance du service de gestion du websocket
        service = new WebSocketService(WS_URL);
    });

    afterEach(() => {
        // Tout fermer et restaurer les implémentation globales
        if(service){
            service.stop();
        }
        mockServer.stop();
        vi.unstubAllGlobals();
    });

    it("should open connection successfully", async () => {
        // Initialiser le témoin de connexion
        let isConnected : boolean = false;
        
        // Relancer le service
        service.restart();

        // On attend le handshake client-serveur
        isConnected = await new Promise<boolean>((resolve) => {
            mockServer.on("connection", (_) => resolve(true));
        });

        expect(isConnected).toBe(true);
    });


});
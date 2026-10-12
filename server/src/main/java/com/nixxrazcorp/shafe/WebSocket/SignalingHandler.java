package com.nixxrazcorp.shafe.WebSocket;

import java.io.IOException;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.nixxrazcorp.shafe.Service.RoomManagerService;


@Component
public class SignalingHandler extends TextWebSocketHandler{
    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);

    private final RoomManagerService roomManagerService;

    public SignalingHandler(RoomManagerService roomManagerService) {
        this.roomManagerService = roomManagerService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session){
        String roomId = recoverRoomId(session);
        log.debug("WebSocket connection established: session={}, room={}", session.getId(), roomId);
        if (roomId != null){
            // Note : Modify the RoomManagerService to throw errors and replace this block by a try{...}catch...
            if (!roomManagerService.joinRoom(roomId, session)){
                log.warn("WebSocket session {} was rejected from room {}", session.getId(), roomId);
            }
        } else {
            log.warn("WebSocket session {} connected without a valid roomId query parameter", session.getId());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status){
        String roomId = recoverRoomId(session);
        log.debug("WebSocket connection closed: session={}, room={}, status={}",
                session.getId(), roomId, status);
        if (roomId != null){
            roomManagerService.leaveRoom(roomId, session);
        } else {
            log.warn("Closed WebSocket session {} has no valid roomId query parameter", session.getId());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message){
        String roomId = recoverRoomId(session);
        if (roomId != null && roomManagerService.recordSignalingActivity(roomId, session)){
            List<WebSocketSession> listOfSessions = roomManagerService.getOtherActiveSessions(roomId, session);
            log.debug("Forwarding signaling message from session {} to {} peer(s) in room {}; payload length={}",
                    session.getId(), listOfSessions.size(), roomId, message.getPayloadLength());

            for (WebSocketSession ws : listOfSessions){
                try{
                    ws.sendMessage(message);
                } catch (IOException e){
                    log.warn("Failed to forward signaling message from session {} to peer {} in room {}",
                            session.getId(), ws.getId(), roomId, e);
                    roomManagerService.leaveRoom(roomId, ws);
                }
            }
        } else if (roomId == null) {
            log.warn("Ignoring signaling message from session {} without a valid roomId query parameter",
                    session.getId());
        } else {
            log.warn("Ignoring signaling message from non-member session {} for room {}", session.getId(), roomId);
        }
    }

    private String recoverRoomId(WebSocketSession session){
        String roomId = null;
        if (session.getUri() == null) {
            log.warn("WebSocket session {} has no URI", session.getId());
            return null;
        }
        String query = session.getUri().getQuery();
        
        if (query != null && query.contains("roomId=")){
            roomId = query.split("roomId=")[1].split("&")[0];
        }
        if (roomId == null || roomId.isBlank()) {
            log.debug("Could not recover roomId for WebSocket session {}", session.getId());
            return null;
        }
        return roomId;
    }
}

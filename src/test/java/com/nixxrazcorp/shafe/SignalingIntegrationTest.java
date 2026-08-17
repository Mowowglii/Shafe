package com.nixxrazcorp.shafe;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.nixxrazcorp.shafe.WebSocket.WebSocketConfig;
import com.nixxrazcorp.shafe.dto.RoomResponse;
import com.nixxrazcorp.shafe.dto.SigMessage;

import tools.jackson.databind.ObjectMapper;


@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.shutdown=graceful",
        "spring.lifecycle.timeout-per-shutdown-phase=30s"
    }, classes = { 
        ShafeApplication.class, WebSocketConfig.class 
    })
public class SignalingIntegrationTest {
    
    @LocalServerPort
    private int port;
    
    private static final int WS_CONNECT_TIMEOUT_SECONDS = 5;
    private static final int MESSAGE_POLL_TIMEOUT_SECONDS = 8;
    private static final Logger log = LoggerFactory.getLogger(SignalingIntegrationTest.class);

    @Test
    public void testSignalingMessageRouting() throws Exception{
        String url = "ws://localhost:"+port+"/signal";
        String roomParam;
        String apiUrl = "http://localhost:"+port+"/api/rooms";

        BlockingQueue<TextMessage> client2ReceivedMessages = new ArrayBlockingQueue<>(1);

        StandardWebSocketClient client = new StandardWebSocketClient();

        // Create the room and recover the roomId
        RestClient restClient = RestClient.create(apiUrl);
        RoomResponse roomResponse = restClient.post().accept(MediaType.APPLICATION_JSON).retrieve().toEntity(RoomResponse.class).getBody();
        assertNotNull(roomResponse, "Failed to create room");
        roomParam = roomResponse.roomId();

        log.info("Room Parameter recovered : {}", roomParam);

        WebSocketSession client2Session = null;
        WebSocketSession client1Session = null;
        try {
            log.info("Connecting client 2 to {}", url + "?roomId=" +roomParam);
            client2Session = client.execute(new TextWebSocketHandler() {
                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                    log.info("Client 2 received message");
                    // When Client 2 gets a message, push it to our queue so the test thread can see it
                    client2ReceivedMessages.add(message);
                }
            }, url + "?roomId=" +roomParam).get(WS_CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            log.info("Client 2 connected successfully");

            log.info("Connecting client 1 to {}", url + "?roomId=" +roomParam);
            client1Session = client.execute(new TextWebSocketHandler(), url + "?roomId=" + roomParam)
            .get(WS_CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            log.info("Client 1 connected successfully");

            // Client 1 sends the message to the Spring Server
            log.info("Client 1 sending message");
            client1Session.sendMessage(new SigMessage("offer", "payload").toTextMessage());

            // Assert that Client 2 received the exact message within specified timeout
            log.info("Waiting for message on client 2 with timeout {} seconds", MESSAGE_POLL_TIMEOUT_SECONDS);
            TextMessage receivedJson = client2ReceivedMessages.poll(MESSAGE_POLL_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            
            assertNotNull(receivedJson, "Client 2 did not receive the message");
            log.info("Message received successfully");
            
            // Deserialize it back to verify the content matches
            SigMessage receivedMessage = new ObjectMapper().readValue(receivedJson.getPayload(), SigMessage.class);
            assertEquals("offer", receivedMessage.getType(), "Message type should be 'offer'");
            assertEquals("payload", receivedMessage.getPayload(), "Message payload should match");
        } finally {
            // Ensure clean up connections even if test fails
            if (client1Session != null) {
                client1Session.close();
            }
            if (client2Session != null) {
                client2Session.close();
            }
        }
    }
}

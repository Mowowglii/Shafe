package com.nixxrazcorp.shafe;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;


@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class SignalingIntegrationTest {
    
    @LocalServerPort
    private int port;

    @Test
    public void testSignalingMessageRouting() throws Exception{
        String url = "ws://localhost:"+port+"/signal";
        String roomParam = "?roomId=room-123";

        BlockingQueue<String> client2ReceivedMessages = new ArrayBlockingQueue<>(1);

        StandardWebSocketClient client = new StandardWebSocketClient();

        WebSocketSession client2Session = client.execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                // When Client 2 gets a message, push it to our queue so the test thread can see it
                client2ReceivedMessages.add(message.getPayload());
            }
        }, url + roomParam).get(2, TimeUnit.SECONDS);

        WebSocketSession client1Session = client.execute(new TextWebSocketHandler(), url + roomParam)
        .get(2, TimeUnit.SECONDS);

        // 5. Client 1 sends the message to the Spring Server
        client1Session.sendMessage(new TextMessage("payload"));

        // 6. Assert that Client 2 received the exact message within 3 seconds
        String receivedJson = client2ReceivedMessages.poll(3, TimeUnit.SECONDS);
        
        assertNotNull(receivedJson);
        
        // Deserialize it back to verify the content matches
        TextMessage receivedMessage = new TextMessage(receivedJson);
        assertEquals("payload", receivedMessage.getPayload());

        // Clean up connections
        client1Session.close();
        client2Session.close();
    }
}

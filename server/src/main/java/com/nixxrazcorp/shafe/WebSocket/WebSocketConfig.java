package com.nixxrazcorp.shafe.WebSocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer{
    private static final Logger log = LoggerFactory.getLogger(WebSocketConfig.class);
    
    private final SignalingHandler signalingHandler;

    public WebSocketConfig(SignalingHandler signalingHandler){
        this.signalingHandler = signalingHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry){
        log.info("Registering WebSocket signaling endpoint at /signal");
        registry.addHandler(signalingHandler, "/signal")
        .addInterceptors(new HttpSessionHandshakeInterceptor())
        .setAllowedOrigins("*");
    }
    
}

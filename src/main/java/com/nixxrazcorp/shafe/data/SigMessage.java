package com.nixxrazcorp.shafe.data;

import org.springframework.web.socket.TextMessage;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import tools.jackson.databind.ObjectMapper;

@Data
@AllArgsConstructor
@NoArgsConstructor
public final class SigMessage{
    private String type;
    private String payload;

    public TextMessage toTextMessage(){
        String json = new ObjectMapper().writeValueAsString(this);
        return new TextMessage(json);
    }
}

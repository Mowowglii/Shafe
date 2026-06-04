package com.nixxrazcorp.shafe;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
public class SessionControllerTest {
    
    @Autowired
    private MockMvc mockMvc;

    @Test
    public void testCreateAndValidateSessionLifecycle() throws Exception {
        // 1. Test POST endpoint creates a dynamic session room
        String responseContent = mockMvc.perform(post("/api/sessions")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomId").exists())
                .andExpect(jsonPath("$.active").value(true))
                .andReturn().getResponse().getContentAsString();

        // Extract the generated roomId from the JSON response
        String generatedRoomId = com.jayway.jsonpath.JsonPath.read(responseContent, "$.roomId");

        // 2. Test GET endpoint successfully validates the room we just made
        mockMvc.perform(get("/api/sessions/" + generatedRoomId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomId").value(generatedRoomId));

        // 3. Test GET endpoint returns a 404 for a totally fake room
        mockMvc.perform(get("/api/sessions/fake-room-id-123"))
                .andExpect(status().isNotFound());
    }
}

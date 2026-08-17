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
    public void testCreateRoom() throws Exception {
        // 1. Test POST endpoint creates a dynamic session room
        mockMvc.perform(post("/api/rooms")
        .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.roomId").exists())
        .andReturn().getResponse().getContentAsString();
    }
}

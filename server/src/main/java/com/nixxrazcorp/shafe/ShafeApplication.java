package com.nixxrazcorp.shafe;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@SpringBootApplication
@EnableScheduling
public class ShafeApplication {
	private static final Logger log = LoggerFactory.getLogger(ShafeApplication.class);

	public static void main(String[] args) {
		log.info("Starting Shafe server");
		SpringApplication.run(ShafeApplication.class, args);
	}

}

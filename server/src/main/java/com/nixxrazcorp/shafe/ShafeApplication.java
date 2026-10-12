package com.nixxrazcorp.shafe;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@SpringBootApplication
public class ShafeApplication {
	private static final Logger log = LoggerFactory.getLogger(ShafeApplication.class);

	public static void main(String[] args) {
		log.info("Starting Shafe server");
		SpringApplication.run(ShafeApplication.class, args);
	}

}

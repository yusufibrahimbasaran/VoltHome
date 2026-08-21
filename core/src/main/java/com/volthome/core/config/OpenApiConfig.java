package com.volthome.core.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("VoltHome API Documentation")
                        .version("1.0.0")
                        .description("REST API endpoints for VoltHome Real-Time IoT Energy Analytics & Budget Control platform"));
    }
}

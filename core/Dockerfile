FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Copy the pre-built Spring Boot jar file
COPY target/volthome-core-1.0.0.jar app.jar

EXPOSE 8080

# Environment variables with defaults
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_NAME=volthome_db
ENV DB_USER=volthome
ENV DB_PASSWORD=volthome_pass
ENV KAFKA_SERVERS=kafka:29092
ENV IGNITE_ADDRESSES=ignite:10800
ENV GEMINI_API_KEY=""

# Run with Apache Ignite JVM options to prevent Java 17 strong encapsulation runtime exceptions
ENTRYPOINT ["java", \
    "--add-exports=java.base/jdk.internal.misc=ALL-UNNAMED", \
    "--add-exports=java.base/sun.nio.ch=ALL-UNNAMED", \
    "--add-exports=java.management/com.sun.jmx.mbeanserver=ALL-UNNAMED", \
    "--add-exports=jdk.internal.jvmstat/sun.jvmstat.monitor=ALL-UNNAMED", \
    "--add-exports=java.base/sun.reflect.generics.reflectiveObjects=ALL-UNNAMED", \
    "--add-opens=jdk.management/com.sun.management.internal=ALL-UNNAMED", \
    "--add-opens=java.base/java.nio=ALL-UNNAMED", \
    "--add-opens=java.base/java.io=ALL-UNNAMED", \
    "--add-opens=java.base/java.util=ALL-UNNAMED", \
    "--add-opens=java.base/java.lang=ALL-UNNAMED", \
    "--add-opens=java.base/java.lang.invoke=ALL-UNNAMED", \
    "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED", \
    "--add-opens=java.base/java.util.concurrent.locks=ALL-UNNAMED", \
    "--add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED", \
    "--add-opens=java.base/java.math=ALL-UNNAMED", \
    "--add-opens=java.sql/java.sql=ALL-UNNAMED", \
    "-jar", "app.jar"]

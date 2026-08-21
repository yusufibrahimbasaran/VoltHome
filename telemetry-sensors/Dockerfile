FROM python:3.10-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir kafka-python-ng

# Copy the python simulator script
COPY VoltHomeTelemetrySensors.py .

# Environment variables
ENV KAFKA_SERVERS=kafka:29092

# Start in unbuffered mode to show logs in docker console immediately
CMD ["python", "-u", "VoltHomeTelemetrySensors.py"]

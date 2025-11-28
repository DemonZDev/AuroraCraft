FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create workspaces directory
RUN mkdir -p /app/workspaces

# Expose port
EXPOSE 8001

# Run database migrations and start server
CMD ["sh", "-c", "python seed_data.py && uvicorn server:app --host 0.0.0.0 --port 8001"]

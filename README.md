# Streaming API Application with Gemini Models

A Node.js application that provides a streaming API interface for Gemini AI models, featuring vector database storage for enhanced responses.

## Features

- REST API endpoint for streaming AI responses
- Integration with Google's Gemini models (gemini-1.5-pro, gemini-1.5-flash)
- Vector database storage using hnswlib-node
- Test page for easy API interaction

## Requirements

- Google API Key for Gemini models

## Quick Start

1. Clone the repository:
   ```
   git clone <repository-url>
   cd <project-directory>
   ```

2. Set your Google API Key:
   Create a `.env` file in the project root:
   ```
KAFKA_BROKER=
KAFKA_USERNAME=
KAFKA_PASSWORD=
KAFKA_TOPIC_NAME=
KAFKA_GROUP_ID_PREFIX=


GOOGLE_API_KEY=


PORT=3000
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_PROJECT_NAME=
   ```

3. Build and run with Docker Compose:
   ```
   npm run dev
   ```

4. Access the test page at http://localhost:3000/

## API Endpoints

### REST API

- `GET /` - Test page for trying the API
- `POST /agent` - Send request to the AI agent (non-streaming)
- `POST /agent/stream` - Send request to the AI agent with streaming response


### Project Structure

- `/public` - Static files, including the test HTML page
- `/dist` - Compiled TypeScript files
- `/src` - Source code
  - `/controllers` - API controllers
  - `/services` - Service layer (AI, vector DB, etc.)

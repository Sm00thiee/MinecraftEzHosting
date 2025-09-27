# Windows Server Setup for Hosting

This document provides instructions for setting up a Windows Server to host the application.

## Prerequisites

Before you begin, ensure you have the following installed on your Windows Server:

- **Node.js**: Required for running the application.
- **Docker Desktop**: Required for running the application in a Docker container.
- **Git**: Required for cloning the repository.

## Installation

1.  **Install Node.js**:
    - Download and install the latest LTS version of Node.js from the [official website](https://nodejs.org/).

2.  **Install Docker Desktop**:
    - Download and install Docker Desktop for Windows from the [official website](https://www.docker.com/products/docker-desktop/).

3.  **Install Git**:
    - Download and install Git from the [official website](https://git-scm.com/).

## Configuration

1.  **Clone the Repository**:
    - Open a terminal and clone the repository:
      ```
      git clone <repository-url>
      ```

2.  **Install Dependencies**:
    - Navigate to the project directory and install the dependencies:
      ```
      npm install
      ```

3.  **Set Environment Variables**:
    - Create a `.env` file in the root of the project and add the following environment variables:
      ```
      SUPABASE_ACCESS_TOKEN=<your-supabase-access-token>
      SUPABASE_DB_PASSWORD=<your-supabase-db-password>
      VITE_SUPABASE_ANON_KEY=<your-vite-supabase-anon-key>
      VITE_SUPABASE_URL=<your-vite-supabase-url>
      ```

## Running the Application

1.  **Build the Application**:
    - Build the application for production:
      ```
      npm run build
      ```

2.  **Build and Run the Docker Container**:
    - Build the Docker image:
      ```
      docker build -t <image-name> .
      ```
    - Run the Docker container:
      ```
      docker run -p 3000:3000 <image-name>
      ```

3.  **Access the Application**:
    - You can now access the application at `http://localhost:3000`.

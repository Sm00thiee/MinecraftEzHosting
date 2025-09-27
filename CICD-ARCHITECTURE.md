# CI/CD Architecture with Jenkins

This document outlines the architecture of the CI/CD pipeline for the project, using Jenkins as the automation server.

## Overview

The pipeline is defined in a `Jenkinsfile` and consists of several stages that automate the process of building, testing, and deploying the application.

## Pipeline Stages

The pipeline is composed of the following stages:

1.  **Checkout**: Checks out the source code from the version control system.
2.  **Install Dependencies**: Installs the necessary Node.js dependencies using `npm install`.
3.  **Lint**: Lints the code to ensure it adheres to the coding standards.
4.  **Test**: Runs the automated tests to ensure the code is working as expected.
5.  **Build**: Builds the application for production.
6.  **Build Docker Image**: Builds a Docker image for the application.
7.  **Deploy to Staging**: Deploys the application to a staging environment when changes are pushed to the `develop` branch.
8.  **Deploy to Production**: Deploys the application to the production environment when changes are pushed to the `main` branch. This stage requires manual approval.

## Environment Variables

The pipeline uses the following environment variables, which are retrieved from Jenkins credentials:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`

## Prerequisites

To use this pipeline, you need to have the following configured in your Jenkins environment:

- Jenkins installed and running.
- The following Jenkins plugins installed:
  - Pipeline
  - Git
  - Credentials Binding
- The necessary credentials configured in Jenkins for Supabase.

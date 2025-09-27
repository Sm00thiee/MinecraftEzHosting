pipeline {
    agent any

    environment {
        SUPABASE_ACCESS_TOKEN = credentials('SUPABASE_ACCESS_TOKEN')
        SUPABASE_DB_PASSWORD = credentials('SUPABASE_DB_PASSWORD')
        VITE_SUPABASE_ANON_KEY = credentials('VITE_SUPABASE_ANON_KEY')
        VITE_SUPABASE_URL = credentials('VITE_SUPABASE_URL')
        DOCKER_REGISTRY_URL = 'your-docker-registry-url'
        DOCKER_CREDENTIALS = credentials('DOCKER_CREDENTIALS')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'npm install'
                    } else {
                        bat 'npm install'
                    }
                }
            }
        }

        stage('Build & Test') {
            parallel {
                stage('Client') {
                    steps {
                        script {
                            if (isUnix()) {
                                sh 'npm run lint'
                                sh 'npm run check'
                                sh 'npm run build'
                            } else {
                                bat 'npm run lint'
                                bat 'npm run check'
                                bat 'npm run build'
                            }
                        }
                    }
                }
                stage('Server') {
                    steps {
                        script {
                            if (isUnix()) {
                                sh 'npm run test'
                            } else {
                                bat 'npm run test'
                            }
                        }
                    }
                }
            }
        }

        stage('DB Migration') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'npx supabase db push'
                    } else {
                        bat 'npx supabase db push'
                    }
                }
            }
        }

        stage('Build & Publish Docker Image') {
            steps {
                script {
                    withCredentials([string(credentialsId: 'DOCKER_CREDENTIALS', variable: 'DOCKER_PASSWORD')]) {
                        if (isUnix()) {
                            sh 'docker login -u "your-docker-username" -p "$DOCKER_PASSWORD" $DOCKER_REGISTRY_URL'
                            sh './scripts/build-docker-image.sh'
                            sh 'docker push $DOCKER_REGISTRY_URL/mc-server-management:latest'
                        } else {
                            bat "docker login -u \"your-docker-username\" -p %DOCKER_PASSWORD% $DOCKER_REGISTRY_URL"
                            bat '.\scripts\build-docker-image.bat'
                            bat 'docker push $DOCKER_REGISTRY_URL/mc-server-management:latest'
                        }
                    }
                }
            }
        }

        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                echo 'Deploying to staging...'
                // Example: ssh into staging server and run docker-compose up
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                input 'Deploy to production?'
                echo 'Deploying to production...'
                // Example: ssh into production server and run docker-compose up
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo 'Pipeline successful!'
            // Add notification steps here (e.g., Slack, Email)
        }
        failure {
            echo 'Pipeline failed.'
            // Add notification steps here (e.g., Slack, Email)
        }
    }
}
pipeline {
    agent { label 'nescom-linux' }
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }
    triggers { pollSCM('H/2 * * * *') }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.IMAGE_TAG = sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim() + '-' + env.BUILD_NUMBER
                }
            }
        }
        stage('Unit Tests') {
            steps { sh 'docker build --target test -t nescom-backend-test:$IMAGE_TAG backend' }
        }
        stage('Build Images') {
            steps {
                sh '''
                    set -eu
                    docker build --target runtime -t "nescom-backend:$IMAGE_TAG" backend
                    docker build -t "nescom-frontend:$IMAGE_TAG" frontend
                '''
            }
        }
        stage('Database Integration Tests') {
            steps { sh 'bash scripts/integration.sh "$IMAGE_TAG"' }
        }
        stage('Deploy and Verify') {
            steps { sh 'bash scripts/deploy.sh "$IMAGE_TAG"' }
        }
    }
    post {
        success { echo "NESCOM release ${env.IMAGE_TAG} deployed and verified." }
        failure { echo 'Build failed. Read the failed stage. Failed deployment verification attempts to restore prior application images.' }
    }
}

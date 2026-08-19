# Referencia de IaC — NO desplegado para este ejercicio (ver PLAN.md, sección 1.9).
# Describe cómo se llevaría este stack a AWS en un escenario real:
# - ECS Fargate (o EKS) para api/worker/ai-agent/web como servicios separados
# - Amazon MQ (RabbitMQ administrado) en vez de un contenedor propio
# - RDS Postgres (con extensión TimescaleDB si el motor la soporta, o
#   Timestream/DynamoDB si se migra el modelo de series temporales)
# - Application Load Balancer con reglas de host-based routing por servicio
# - Secrets Manager para ANTHROPIC_API_KEY y credenciales de DB

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# --- Placeholder de recursos, no aplicado ---
# resource "aws_ecs_cluster" "fleet" { name = "fleet-telemetry" }
# resource "aws_db_instance" "postgres" { ... }
# resource "aws_mq_broker" "rabbitmq" { engine_type = "RabbitMQ" ... }

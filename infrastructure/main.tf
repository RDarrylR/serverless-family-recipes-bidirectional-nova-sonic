terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = "blog_admin"

  default_tags {
    tags = {
      Project     = "bidir-streaming-voice-agent"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Local dev IAM role for Bedrock access
module "bedrock" {
  source = "./modules/bedrock"

  aws_region        = var.aws_region
  knowledge_base_id = var.knowledge_base_id
}

# S3 bucket for frontend static files
module "storage" {
  source = "./modules/storage"

  project_name = var.project_name
  environment  = var.environment
}

# Cognito user pool + identity pool for browser auth
module "auth" {
  source = "./modules/auth"

  project_name      = var.project_name
  environment       = var.environment
  callback_urls     = var.cognito_callback_urls
  agent_runtime_arn = var.agent_runtime_arn
}

# CloudFront distribution for frontend (S3 origin only)
module "cdn" {
  source = "./modules/cdn"

  project_name                         = var.project_name
  environment                          = var.environment
  frontend_bucket_id                   = module.storage.frontend_bucket_id
  frontend_bucket_arn                  = module.storage.frontend_bucket_arn
  frontend_bucket_regional_domain_name = module.storage.frontend_bucket_regional_domain_name
}

# ECR repository + AgentCore IAM role for agent Docker image
module "container" {
  source = "./modules/container"

  project_name      = var.project_name
  environment       = var.environment
  aws_region        = var.aws_region
  knowledge_base_id = var.knowledge_base_id
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "voice-recipe"
}

variable "environment" {
  description = "Environment (dev, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be one of: dev, prod."
  }
}

variable "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID for recipe search"
  type        = string

  validation {
    condition     = can(regex("^[A-Z0-9]{10}$", var.knowledge_base_id))
    error_message = "Knowledge base ID must be exactly 10 uppercase alphanumeric characters."
  }
}

variable "cognito_callback_urls" {
  description = "Cognito callback URLs for the web client"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "agent_runtime_arn" {
  description = "AgentCore Runtime ARN. Empty string skips the Cognito IAM policy for AgentCore."
  type        = string
  default     = ""
}

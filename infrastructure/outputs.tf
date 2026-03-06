output "bedrock_role_arn" {
  description = "IAM role ARN for Bedrock access"
  value       = module.bedrock.role_arn
}

# Storage
output "frontend_bucket_id" {
  description = "Frontend S3 bucket ID"
  value       = module.storage.frontend_bucket_id
}

# Auth
output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.auth.user_pool_id
}

output "user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = module.auth.user_pool_client_id
}

output "identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = module.auth.identity_pool_id
}

# CDN
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cdn.distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name"
  value       = module.cdn.distribution_domain_name
}

# Container
output "ecr_repository_url" {
  description = "ECR repository URL for agent image"
  value       = module.container.repository_url
}

output "agentcore_role_arn" {
  description = "IAM role ARN for AgentCore runtime"
  value       = module.container.agentcore_role_arn
}

output "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID (pass-through from variable)"
  value       = var.knowledge_base_id
}

# AgentCore (pass-through from variable, set after create-agent)
output "agent_runtime_arn" {
  description = "AgentCore Runtime ARN (set via terraform.tfvars after create-agent)"
  value       = var.agent_runtime_arn
}

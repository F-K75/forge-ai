# Secrets Management for Forge AI

This document describes how to configure secrets for Forge AI deployments.

## Production Secret Management

**All secrets MUST be injected at deployment time from an external secret manager.** Never commit actual secrets to the repository.

### Supported Secret Providers

1. **HashiCorp Vault** - Recommended for on-premise deployments
2. **AWS Secrets Manager** - Recommended for AWS deployments
3. **Azure Key Vault** - For Azure deployments  
4. **GCP Secret Manager** - For GCP deployments
5. **External Secrets Operator** - Kubernetes-native solution for any cloud provider

### Kubernetes Integration Example (External Secrets Operator)

Create a secret store and external secret definition:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: forge-ai-prod
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: forge-ai-irsa
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: forge-ai-secrets
  namespace: forge-ai-prod
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: forge-ai-secrets
    creationPolicy: Owner
  data:
    - secretKey: jwt-secret
      remoteRef:
        key: forge-ai/production/jwt-secret
    - secretKey: field-encryption-key
      remoteRef:
        key: forge-ai/production/field-encryption-key
    - secretKey: stripe-secret-key
      remoteRef:
        key: forge-ai/production/stripe-secret-key
    - secretKey: stripe-webhook-secret
      remoteRef:
        key: forge-ai/production/stripe-webhook-secret
    - secretKey: mongo-password
      remoteRef:
        key: forge-ai/production/mongo-password
    - secretKey: redis-password
      remoteRef:
        key: forge-ai/production/redis-password
    - secretKey: anthropic-api-key
      remoteRef:
        key: forge-ai/production/anthropic-api-key
    - secretKey: openai-api-key
      remoteRef:
        key: forge-ai/production/openai-api-key
    - secretKey: resend-api-key
      remoteRef:
        key: forge-ai/production/resend-api-key
    - secretKey: github-client-id
      remoteRef:
        key: forge-ai/production/github-client-id
    - secretKey: github-client-secret
      remoteRef:
        key: forge-ai/production/github-client-secret
```

### Required Secrets

| Secret Key | Description | Example Value | Required |
|------------|-------------|---------------|----------|
| `jwt-secret` | JWT signing key (64 hex chars) | `a1b2c3d4...` | Yes |
| `field-encryption-key` | Fernet encryption key (different from JWT) | `b2c3d4e5...` | Yes |
| `stripe-secret-key` | Stripe API secret key | `sk_live_...` | Yes |
| `stripe-webhook-secret` | Stripe webhook signing secret | `whsec_...` | Yes |
| `mongo-password` | MongoDB admin password | `secure_random_password` | Yes |
| `redis-password` | Redis password (empty if not required) | `secure_random_password` | Yes |
| `anthropic-api-key` | Anthropic Claude API key | `sk-ant-...` | Yes |
| `openai-api-key` | OpenAI API key (fallback) | `sk-...` | No |
| `resend-api-key` | Resend email service key | `re_...` | Yes |
| `github-client-id` | GitHub OAuth app ID | `Iv1.123...` | Yes |
| `github-client-secret` | GitHub OAuth app secret | `secret...` | Yes |

### Generating Secure Secrets

```bash
# Generate JWT secret (64 hex characters)
openssl rand -hex 32

# Generate field encryption key
python -c "from cryptography.fernet import Fernet; import base64; print(base64.urlsafe_b64encode(Fernet.generate_key()[:32]).decode())"
```

### CI/CD Integration

For deployment pipelines, retrieve secrets from your secret manager:

```bash
# AWS example
aws secretsmanager get-secret-value --secret-id forge-ai/production/jwt-secret --query SecretString --output text

# Vault example
vault kv get -field=jwt-secret secret/forge-ai/production
```

### Staging vs Production

Use separate secret paths for staging and production:

- Production: `forge-ai/production/*`
- Staging: `forge-ai/staging/*`

### Secret Rotation

1. Add new secret version to your secret manager
2. Update ExternalSecret or re-deploy to pick up new version (or run `kubectl rollout restart deployment/backend deployment/celery-worker -n forge-ai-prod` if your secret sync doesn't trigger a rollout)
3. Legacy secrets remain available during transition until all pods pick up the new value

### Verification

After deployment, verify secrets are loaded:

```bash
# Check secrets exist
kubectl get secret forge-ai-secrets -n forge-ai-prod -o yaml

# Verify health endpoint
kubectl port-forward svc/backend 8000:8000 -n forge-ai-prod
curl http://localhost:8000/health/detailed
```
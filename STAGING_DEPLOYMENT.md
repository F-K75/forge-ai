# Staging Deployment Guide - Security Hardened

## Prerequisites

- Docker & Docker Compose installed
- MongoDB Atlas account (or local MongoDB)
- Redis Cloud account (or local Redis)
- Anthropic API key
- Stripe test keys
- Resend API key (for emails)
- Domain name (for SSL testing)

## Step 1: Environment Setup

### 1.1 Clone and Configure

```bash
git clone <your-repo>
cd forge-ai
cp .env.example .env
```

### 1.2 Generate Secure Secrets

```bash
# Generate JWT secret (minimum 32 characters)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Generate MongoDB password
python3 -c "import secrets; print(secrets.token_urlsafe(16))"

# Generate Redis password
python3 -c "import secrets; print(secrets.token_urlsafe(16))"
```

### 1.3 Update .env File

```env
# CRITICAL: Use strong, unique values for production
JWT_SECRET=<generated-jwt-secret>
MONGO_PASSWORD=<generated-mongo-password>
REDIS_PASSWORD=<generated-redis-password>

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
RESEND_API_KEY=re_...

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# URLs
APP_URL=https://staging.yourdomain.com
API_URL=https://api-staging.yourdomain.com

# Admin
ADMIN_EMAILS=admin@yourdomain.com

# Security
TRUSTED_PROXIES=127.0.0.1,::1  # Add your load balancer IPs
ALLOWED_ORIGINS=https://staging.yourdomain.com,https://www.yourdomain.com
```

## Step 2: Infrastructure Setup

### Option A: Docker Compose (Local Staging)

```bash
# Start services
docker compose up -d

# Verify all services are running
docker compose ps

# Check logs
docker compose logs -f backend
```

### Option B: Cloud Deployment (Recommended for Staging)

#### 2.1 MongoDB Atlas

1. Create cluster (M2+ recommended for staging)
2. Whitelist IP addresses
3. Create database user
4. Get connection string:
   ```
   mongodb+srv://forge:<password>@cluster.mongodb.net/forge?retryWrites=true&w=majority
   ```

#### 2.2 Redis Cloud

1. Sign up at redis.com/cloud
2. Create database (30MB free tier)
3. Get connection string:
   ```
   redis://default:<password>@redis-12345.c12345.us-east-1-2.ec2.cloud.redislabs.com:12345
   ```

#### 2.3 Deploy to Railway/Render/Fly.io

**Railway:**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Environment variables in Railway dashboard:**
- Set all variables from .env
- Enable auto-deploy from GitHub

## Step 3: Security Verification

### 3.1 Verify Security Headers

```bash
# Run security header check
curl -I https://api-staging.yourdomain.com/health

# Expected headers:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
# Strict-Transport-Security: max-age=31536000; includeSubDomains
# Content-Security-Policy: default-src 'self'; ...
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### 3.2 Test Input Sanitization

```bash
# Test NoSQL injection prevention
curl -X POST https://api-staging.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": {"$ne": null}, "password": {"$ne": null}}'

# Should return 422 (validation error), not 200
```

### 3.3 Test Rate Limiting

```bash
# Send 11 requests in 60 seconds (should trigger rate limit on 11th)
for i in {1..11}; do
  curl https://api-staging.yourdomain.com/auth/login \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test"}'
done

# 11th request should return 429
```

### 3.4 Verify Encryption

```bash
# Connect to MongoDB and check user document
mongosh "mongodb+srv://forge:<password>@cluster.mongodb.net/forge"

# In MongoDB shell:
db.users.findOne({"email": "your-email@test.com"})

# Verify github_token is encrypted (starts with "gAAAAA")
# Verify hashed_password is bcrypt hash (starts with "$2b$")
```

### 3.5 Test CORS

```bash
# Test from browser console or curl
curl -X OPTIONS https://api-staging.yourdomain.com/auth/login \
  -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: POST"

# Should return 403 or no Access-Control-Allow-Origin header
```

## Step 4: Automated Security Scanning

### 4.1 Install Security Tools

```bash
# Install Snyk
npm install -g snyk

# Install Trivy
brew install trivy  # macOS
# OR
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
```

### 4.2 Run Dependency Scan

```bash
# Backend dependencies
cd backend
snyk test --severity-threshold=high

# Fix vulnerabilities
snyk fix

# Frontend dependencies
cd ../frontend
npm audit
npm audit fix
```

### 4.3 Container Image Scan

```bash
# Build backend image
docker build -t forge-backend ./backend

# Scan with Trivy
trivy image --severity HIGH,CRITICAL forge-backend

# Scan frontend
docker build -t forge-frontend ./frontend
trivy image --severity HIGH,CRITICAL forge-frontend
```

### 4.4 SAST Scan

```bash
# Install Bandit (Python security linter)
pip install bandit

# Run on backend
cd backend
bandit -r . -f json -o bandit-report.json

# Review high/medium severity issues
cat bandit-report.json | jq '.[] | select(.issue_severity == "HIGH")'
```

## Step 5: Load Testing

### 5.1 Install k6

```bash
# macOS
brew install k6

# Or download from https://k6.io/docs/getting-started/installation/
```

### 5.2 Create Load Test Script

Create `load-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],    // <1% error rate
  },
};

export default function () {
  // Health check
  const healthRes = http.get('https://api-staging.yourdomain.com/health');
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);
}
```

### 5.3 Run Load Test

```bash
k6 run load-test.js

# Expected results:
# - 200 concurrent users: <500ms response time
# - Error rate: <1%
# - No memory leaks
# - Rate limiting works correctly
```

## Step 6: Monitoring Setup

### 6.1 Application Monitoring

**Sentry (Error Tracking):**
```bash
# Install Sentry SDK
cd backend
pip install sentry-sdk[fastapi]

# Add to main.py
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware

sentry_sdk.init(
    dsn="https://<key>@sentry.io/<project>",
    environment="staging",
    traces_sample_rate=1.0,
)
```

**Prometheus + Grafana:**
```yaml
# Add to docker-compose.yml
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
  
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### 6.2 Log Aggregation

**ELK Stack (Elasticsearch, Logstash, Kibana):**
```yaml
# Add to docker-compose.yml
services:
  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
  
  logstash:
    image: logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
  
  kibana:
    image: kibana:8.11.0
    ports:
      - "5601:5601"
```

## Step 7: SSL/TLS Configuration

### 7.1 Let's Encrypt (Free SSL)

```bash
# Install Certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d api-staging.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 7.2 Nginx Reverse Proxy

Create `/etc/nginx/sites-available/forge-api`:

```nginx
server {
    listen 443 ssl http2;
    server_name api-staging.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api-staging.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api-staging.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api-staging.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

## Step 8: Backup Strategy

### 8.1 Automated MongoDB Backups

Create `scripts/backup-mongodb.sh`:

```bash
#!/bin/bash
# Daily MongoDB backup to S3

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/mongodb_backups"
S3_BUCKET="s3://your-backup-bucket/forge-staging"

# Create backup
mongodump --uri="mongodb+srv://forge:<password>@cluster.mongodb.net/forge" \
  --out=$BACKUP_DIR/$DATE

# Compress
tar -czf $BACKUP_DIR/$DATE.tar.gz -C $BACKUP_DIR $DATE

# Upload to S3
aws s3 cp $BACKUP_DIR/$DATE.tar.gz $S3_BUCKET/$DATE.tar.gz

# Cleanup local
rm -rf $BACKUP_DIR/$DATE $BACKUP_DIR/$DATE.tar.gz

# Delete backups older than 30 days
aws s3 ls $S3_BUCKET/ | awk '{print $4}' | while read file; do
  FILE_DATE=$(echo $file | grep -oP '\d{8}')
  FILE_AGE=$(( ($(date +%s) - $(date -d ${FILE_DATE:0:8} +%s)) / 86400 ))
  if [ $FILE_AGE -gt 30 ]; then
    aws s3 rm $S3_BUCKET/$file
  fi
done
```

### 8.2 Schedule with Cron

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /path/to/forge-ai/scripts/backup-mongodb.sh >> /var/log/mongodb-backup.log 2>&1
```

## Step 9: CI/CD Pipeline

### 9.1 GitHub Actions Workflow

Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-asyncio
      
      - name: Run tests
        run: |
          cd backend
          pytest tests/ -v

  deploy:
    needs: [security-scan, test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Railway
        uses: railway-app/railway-action@v1
        with:
          railway-token: ${{ secrets.RAILWAY_TOKEN }}
```

## Step 10: Verification Checklist

### Pre-Deployment

- [ ] All environment variables set
- [ ] JWT_SECRET is 32+ characters
- [ ] MongoDB and Redis passwords are strong
- [ ] SSL certificates installed
- [ ] Domain DNS configured
- [ ] Firewall rules set (only ports 80, 443 open)

### Post-Deployment

- [ ] Health check returns 200: `curl https://api-staging.yourdomain.com/health`
- [ ] Security headers present: `curl -I https://api-staging.yourdomain.com/health`
- [ ] HTTPS redirects work: `curl -I http://api-staging.yourdomain.com`
- [ ] Rate limiting works (11th request returns 429)
- [ ] CORS blocks unauthorized origins
- [ ] Input sanitization prevents injection
- [ ] Encryption works (check MongoDB for encrypted tokens)
- [ ] Logs are being collected
- [ ] Monitoring dashboards are accessible
- [ ] Backups are running (check S3 bucket)
- [ ] Load test passes (200 concurrent users)

## Troubleshooting

### Issue: "Connection refused" to MongoDB
```bash
# Check MongoDB connection string
# Verify IP whitelist includes your server IP
# Test connection: mongosh "mongodb+srv://..."
```

### Issue: "Redis connection failed"
```bash
# Verify Redis URL and password
# Test: redis-cli -h <host> -p <port> -a <password> ping
```

### Issue: "CORS errors in browser"
```bash
# Check ALLOWED_ORIGINS in .env
# Verify CORS middleware is loaded
# Check browser console for specific origin
```

### Issue: "Encryption errors"
```bash
# Verify JWT_SECRET is set and consistent
# Check cryptography library version: pip show cryptography
# Review logs for Fernet key errors
```

## Rollback Plan

If staging deployment fails:

```bash
# 1. Rollback to previous version
git revert HEAD
git push origin main

# 2. Or use Railway/Render rollback feature
railway rollback

# 3. Verify rollback
curl https://api-staging.yourdomain.com/health

# 4. Check logs for errors
docker compose logs -f backend
```

## Next Steps

1. **Load Testing**: Run k6 tests with 500+ concurrent users
2. **Penetration Testing**: Hire security firm or use bug bounty
3. **Performance Tuning**: Optimize slow queries, add caching
4. **Documentation**: Update API docs, user guides
5. **Production Deployment**: Follow same process with production config

## Support

- Security issues: security@yourdomain.com
- Infrastructure: devops@yourdomain.com
- General: support@yourdomain.com
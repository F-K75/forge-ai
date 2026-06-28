# Security Scanning Guide

## Overview

This document outlines the security scanning procedures for the forge-ai platform. All scans should be run before deploying to staging and production.

## Table of Contents

1. [Dependency Scanning](#dependency-scanning)
2. [Container Scanning](#container-scanning)
3. [SAST (Static Application Security Testing)](#sast)
4. [DAST (Dynamic Application Security Testing)](#dast)
5. [Secrets Detection](#secrets-detection)
6. [Infrastructure Scanning](#infrastructure-scanning)
7. [Compliance Checks](#compliance-checks)
8. [Automated CI/CD Integration](#automated-cicd-integration)

---

## 1. Dependency Scanning

### 1.1 Snyk (Recommended)

**Installation:**
```bash
npm install -g snyk
# OR
pip install snyk
```

**Backend Python Dependencies:**
```bash
cd backend

# Initialize Snyk (first time only)
snyk init

# Test for vulnerabilities
snyk test --severity-threshold=high

# Generate HTML report
snyk test --severity-threshold=high --json | snyk-to-html -o snyk-report.html

# Fix automatically fixable issues
snyk fix

# Monitor for new vulnerabilities (CI/CD)
snyk monitor
```

**Frontend JavaScript Dependencies:**
```bash
cd frontend

# Test npm packages
snyk test --severity-threshold=high

# Audit npm
npm audit
npm audit fix

# Generate report
npm audit --json > npm-audit.json
```

**Expected Output:**
```
✓ Tested 45 dependencies for known vulnerabilities
✗ 3 vulnerabilities found:
  - 1 high severity (SQL injection in dependency X)
  - 2 medium severity (XSS in dependency Y)
  
Run `snyk fix` to remediate 2 of 3 issues.
```

### 1.2 OWASP Dependency-Check

**Installation:**
```bash
# Download from https://owasp.org/www-project-dependency-check/
# Or use Docker
docker run --rm -v $(pwd):/src owasp/dependency-check:latest \
  --scan /src/backend \
  --format JSON \
  --out /src/reports
```

**Usage:**
```bash
cd backend

# Generate report
dependency-check --scan . --format HTML --out dependency-check-report.html

# Fail build on high/critical vulnerabilities
dependency-check --scan . --failOnCVSS 7
```

---

## 2. Container Scanning

### 2.1 Trivy (Recommended)

**Installation:**
```bash
# macOS
brew install trivy

# Linux
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Docker
docker run aquasec/trivy:latest image nginx:latest
```

**Scan Backend Image:**
```bash
# Build image
docker build -t forge-backend:latest ./backend

# Scan for vulnerabilities
trivy image --severity HIGH,CRITICAL forge-backend:latest

# Generate JSON report
trivy image --format json -o trivy-backend.json forge-backend:latest

# Generate HTML report
trivy image --format template --template "@contrib/html.tpl" -o trivy-backend.html forge-backend:latest

# Ignore unfixable vulnerabilities
trivy image --ignore-unfixed forge-backend:latest
```

**Scan Frontend Image:**
```bash
docker build -t forge-frontend:latest ./frontend
trivy image --severity HIGH,CRITICAL forge-frontend:latest
```

**Scan Docker Compose:**
```bash
# Scan all images in docker-compose.yml
trivy config --severity HIGH,CRITICAL docker-compose.yml
```

**Expected Output:**
```
2024-01-15T10:00:00.000Z	INFO	Detected OS: debian
2024-01-15T10:00:00.000Z	INFO	Number of language-specific files: 1
2024-01-15T10:00:00.000Z	INFO	Detecting pip vulnerabilities...

Total: 12 (HIGH: 3, CRITICAL: 1)
```

### 2.2 Grype

**Installation:**
```bash
# Install
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

# Scan image
grype forge-backend:latest -o json > grype-report.json

# Fail on critical
grype forge-backend:latest --fail-on critical
```

---

## 3. SAST (Static Application Security Testing)

### 3.1 Bandit (Python)

**Installation:**
```bash
pip install bandit
```

**Run on Backend:**
```bash
cd backend

# Basic scan
bandit -r . -f json -o bandit-report.json

# Scan with higher confidence level
bandit -r . -ll -f json -o bandit-report.json

# Generate HTML report
bandit -r . -f html -o bandit-report.html

# Specific severity
bandit -r . -i HIGH -f json
```

**Common Issues to Fix:**
```python
# ❌ BAD: Hardcoded password
password = "admin123"

# ✅ GOOD: Use environment variable
import os
password = os.getenv("DB_PASSWORD")

# ❌ BAD: Shell injection
os.system(f"ping {user_input}")

# ✅ GOOD: Use subprocess with list args
import subprocess
subprocess.run(["ping", "-c", "1", user_input], check=False)

# ❌ BAD: Weak cryptography
hashlib.md5(password).hexdigest()

# ✅ GOOD: Use bcrypt
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
pwd_context.hash(password)
```

**Expected Bandit Output:**
```
>> Issue: [B301:blacklist] Use of insecure MD2, MD4, MD5, or SHA1 hash function
   Severity: Medium   Confidence: High
   Location: backend/auth.py:45
```

### 3.2 ESLint Security (JavaScript/TypeScript)

**Installation:**
```bash
cd frontend
npm install --save-dev eslint-plugin-security
```

**Configuration (.eslintrc.js):**
```javascript
module.exports = {
  plugins: ['security'],
  extends: ['plugin:security/recommended'],
  rules: {
    'security/detect-object-injection': 'error',
    'security/detect-non-literal-fs-filename': 'error',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
  }
};
```

**Run:**
```bash
npx eslint src/ --ext .ts,.tsx --format json --output-file eslint-security-report.json
```

### 3.3 Semgrep (Multi-language)

**Installation:**
```bash
# Install
pip install semgrep

# Run security rules
semgrep --config p/security-audit --json --output semgrep-report.json .

# Specific languages
semgrep --config p/python --json -o semgrep-python.json backend/
semgrep --config p/typescript --json -o semgrep-ts.json frontend/src/
```

---

## 4. DAST (Dynamic Application Security Testing)

### 4.1 OWASP ZAP (Zed Attack Proxy)

**Installation:**
```bash
# Docker (recommended)
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://api-staging.yourdomain.com \
  -r zap-report.html

# Or install locally
brew install owasp-zap  # macOS
```

**Baseline Scan:**
```bash
# Quick scan (5-10 minutes)
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://api-staging.yourdomain.com \
  -r zap-baseline-report.html \
  -J zap-baseline-report.json
```

**Full Scan:**
```bash
# Comprehensive scan (30-60 minutes)
docker run -t owasp/zap2docker-stable zap-full-scan.py \
  -t https://api-staging.yourdomain.com \
  -r zap-full-report.html \
  -J zap-full-report.json
```

**API Scan:**
```bash
# Import OpenAPI spec and scan
docker run -t owasp/zap2docker-stable zap-api-scan.py \
  -t https://api-staging.yourdomain.com/openapi.json \
  -f openapi \
  -r zap-api-report.html
```

**Expected Alerts:**
```
HIGH: SQL Injection
MEDIUM: Cross-Site Scripting (XSS)
MEDIUM: Missing Anti-CSRF Tokens
LOW: Cookie No HttpOnly Flag
INFO: Server Leaks Version Info
```

### 4.2 Nikto (Web Server Scanner)

```bash
# Install
sudo apt install nikto

# Scan
nikto -h https://api-staging.yourdomain.com -o nikto-report.txt

# JSON output
nikto -h https://api-staging.yourdomain.com -Format json -o nikto-report.json
```

---

## 5. Secrets Detection

### 5.1 GitLeaks

**Installation:**
```bash
# macOS
brew install gitleaks

# Linux
curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks-linux-amd64 \
  | sudo install -o root -g root -m 0755 /dev/stdin /usr/local/bin/gitleaks
```

**Scan Repository:**
```bash
# Scan entire git history
gitleaks detect --source . --report-path gitleaks-report.json --report-format json

# Scan without git history (faster)
gitleaks detect --no-git --source . --report-path gitleaks-report.json

# Prevent commits (pre-commit hook)
gitleaks protect --source . --staged
```

**Configuration (.gitleaks.toml):**
```toml
title = "Gitleaks Config"

[extend]
useDefault = true

[allowlist]
paths = [
  '''node_modules''',
  '''.git''',
  '''dist''',
  '''build''',
  '''*.test.js''',
  '''*.spec.js''',
]
```

### 5.2 TruffleHog

```bash
# Install
pip install truffleHog

# Scan git history
truffleHog --regex --entropy=False https://github.com/your-org/forge-ai

# JSON output
truffleHog --json https://github.com/your-org/forge-ai > trufflehog-report.json
```

### 5.3 detect-secrets (Yelp)

```bash
# Install
pip install detect-secrets

# Create baseline
detect-secrets scan > .secrets.baseline

# Audit
detect-secrets audit .secrets.baseline

# Check for new secrets
detect-secrets scan --baseline .secrets.baseline
```

---

## 6. Infrastructure Scanning

### 6.1 Checkov (Infrastructure as Code)

**Installation:**
```bash
pip install checkov
```

**Scan Terraform/CloudFormation:**
```bash
# Scan IaC files
checkov -d infrastructure/ --output json > checkov-report.json

# Specific checks
checkov -d infrastructure/ --check CKV_AWS_1,CKV_AWS_2
```

**Scan Dockerfiles:**
```bash
checkov -f Dockerfile --dockerfile-mode
```

### 6.2 kube-bench (Kubernetes Security)

```bash
# Install
curl -L https://github.com/aquasecurity/kube-bench/releases/latest/download/kube-bench_linux_amd64.tar.gz | tar -xz

# Run CIS benchmark
kube-bench run --json > kube-bench-report.json
```

---

## 7. Compliance Checks

### 7.1 OWASP Top 10 2021

**Checklist:**

| # | Vulnerability | Status | Test |
|---|--------------|--------|------|
| A01 | Broken Access Control | ✅ Fixed | Test unauthorized access |
| A02 | Cryptographic Failures | ✅ Fixed | Verify encryption at rest |
| A03 | Injection | ✅ Fixed | Test SQL/NoSQL injection |
| A04 | Insecure Design | ⚠️ Partial | Review architecture |
| A05 | Security Misconfiguration | ✅ Fixed | Verify security headers |
| A06 | Vulnerable Components | 🔄 Scanning | Run Snyk/Trivy |
| A07 | Auth Failures | ✅ Fixed | Test weak passwords rejected |
| A08 | Data Integrity Failures | ⚠️ Partial | Add CI/CD verification |
| A09 | Logging Failures | ⚠️ Partial | Add audit logging |
| A10 | SSRF | 🔄 TODO | Test SSRF prevention |

### 7.2 PCI DSS (If Handling Payments)

```bash
# Use OpenSCAP
sudo apt install openscap-scanner

# Run PCI DSS profile
oscap xccdf eval --profile pci-dss --report pci-dss-report.html /usr/share/openscap/scenarios/pci-dss-4.0-xccdf.xml
```

### 7.3 GDPR Compliance

**Checklist:**
- [ ] Data encryption at rest (✅ Implemented)
- [ ] Data encryption in transit (✅ HTTPS)
- [ ] User data export endpoint (❌ TODO)
- [ ] User data deletion endpoint (❌ TODO)
- [ ] Privacy policy (❌ TODO)
- [ ] Cookie consent (❌ TODO)
- [ ] Data retention policy (⚠️ Partial - TTL indexes)
- [ ] Breach notification process (❌ TODO)

---

## 8. Automated CI/CD Integration

### 8.1 GitHub Actions Workflow

Create `.github/workflows/security-scan.yml`:

```yaml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Snyk
        uses: snyk/actions/python@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build backend image
        run: docker build -t forge-backend ./backend
      
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'forge-backend'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
      
      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

  sast-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Bandit
        run: |
          cd backend
          pip install bandit
          bandit -r . -f json -o bandit-report.json
      
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/security-audit

  secrets-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  dast-scan:
    runs-on: ubuntu-latest
    needs: [dependency-scan, container-scan, sast-scan]
    steps:
      - uses: actions/checkout@v3
      
      - name: Run OWASP ZAP
        uses: zaproxy/action-baseline@v0.7.0
        with:
          target: 'https://staging.yourdomain.com'
          rules_file: '.zap/rules.tsv'

  security-report:
    runs-on: ubuntu-latest
    needs: [dependency-scan, container-scan, sast-scan, secrets-scan, dast-scan]
    if: always()
    steps:
      - name: Generate security report
        run: |
          echo "# Security Scan Report" > security-report.md
          echo "## Summary" >> security-report.md
          echo "- Dependency Scan: ✅" >> security-report.md
          echo "- Container Scan: ✅" >> security-report.md
          echo "- SAST Scan: ✅" >> security-report.md
          echo "- Secrets Scan: ✅" >> security-report.md
          echo "- DAST Scan: ✅" >> security-report.md
      
      - name: Upload report
        uses: actions/upload-artifact@v3
        with:
          name: security-report
          path: security-report.md
```

### 8.2 Pre-commit Hooks

Create `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks

  - repo: https://github.com/PyCQA/bandit
    rev: 1.7.5
    hooks:
      - id: bandit
        args: ['-r', 'backend/']

  - repo: https://github.com/returntocorp/semgrep
    rev: v1.50.0
    hooks:
      - id: semgrep
        args: ['--config', 'p/security-audit']

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: check-added-large-files
        args: ['--maxkb=1000']
      - id: check-merge-conflict
      - id: detect-private-key
```

**Install:**
```bash
pip install pre-commit
pre-commit install
```

---

## 9. Security Metrics & KPIs

### 9.1 Key Metrics to Track

| Metric | Target | Current | Frequency |
|--------|--------|---------|-----------|
| Critical vulnerabilities | 0 | TBD | Daily |
| High vulnerabilities | < 5 | TBD | Daily |
| Medium vulnerabilities | < 20 | TBD | Weekly |
| Secrets in code | 0 | TBD | Per commit |
| Security scan coverage | 100% | TBD | Weekly |
| Mean time to remediate (MTTR) | < 7 days | TBD | Monthly |
| Failed security tests | 0 | TBD | Per build |

### 9.2 Security Dashboard

**Grafana Dashboard JSON:**
```json
{
  "dashboard": {
    "title": "Security Metrics",
    "panels": [
      {
        "title": "Vulnerabilities by Severity",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(security_vulnerabilities{severity=\"critical\"})"
          }
        ]
      },
      {
        "title": "Failed Login Attempts",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(auth_failures_total[5m])"
          }
        ]
      },
      {
        "title": "Rate Limited Requests",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(rate_limit_hits_total[5m])"
          }
        ]
      }
    ]
  }
}
```

---

## 10. Incident Response

### 10.1 Vulnerability Disclosure Process

**Severity Levels:**

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| Critical | Remote code execution, data breach | 24 hours | SQL injection in auth |
| High | Privilege escalation, XSS | 72 hours | CSRF vulnerability |
| Medium | Information disclosure | 1 week | Verbose error messages |
| Low | Best practice violation | 1 month | Missing security header |

### 10.2 Incident Response Checklist

**When vulnerability found:**

- [ ] **Immediate (0-24h)**
  - [ ] Assess severity and impact
  - [ ] Notify security team
  - [ ] Create incident ticket
  - [ ] Implement temporary mitigation (WAF rule, disable feature)
  - [ ] Document timeline

- [ ] **Short-term (24-72h)**
  - [ ] Develop permanent fix
  - [ ] Test fix in staging
  - [ ] Deploy to production
  - [ ] Verify fix resolves issue
  - [ ] Update security documentation

- [ ] **Long-term (1-2 weeks)**
  - [ ] Root cause analysis
  - [ ] Update security policies
  - [ ] Add automated tests
  - [ ] Conduct team training
  - [ ] Publish security advisory (if public)

### 10.3 Security Contact

**Internal:**
- Security Team: security@yourdomain.com
- On-call Engineer: +1-xxx-xxx-xxxx
- Slack: #security-incidents

**External:**
- Bug Bounty: security@yourdomain.com
- PGP Key: [Link to public key]
- Responsible Disclosure: https://yourdomain.com/security

---

## 11. Regular Security Tasks

### Daily
- [ ] Review security alerts from monitoring
- [ ] Check failed login attempts
- [ ] Review rate limiting logs

### Weekly
- [ ] Run dependency scan (Snyk)
- [ ] Review security events in MongoDB
- [ ] Check for new CVEs in dependencies

### Monthly
- [ ] Full container scan (Trivy)
- [ ] SAST scan (Bandit, Semgrep)
- [ ] Review access logs
- [ ] Update dependencies

### Quarterly
- [ ] Penetration testing
- [ ] Security audit by third party
- [ ] Review and update security policies
- [ ] Team security training

### Annually
- [ ] SOC 2 Type II audit (if applicable)
- [ ] Disaster recovery drill
- [ ] Compliance audit (GDPR, PCI DSS)

---

## 12. Tools Summary

| Tool | Purpose | Frequency | Cost |
|------|---------|-----------|------|
| Snyk | Dependency scanning | Daily | Free-$99/mo |
| Trivy | Container scanning | Per build | Free |
| Bandit | Python SAST | Per commit | Free |
| Semgrep | Multi-language SAST | Per commit | Free |
| OWASP ZAP | DAST | Weekly | Free |
| Gitleaks | Secrets detection | Per commit | Free |
| k6 | Load testing | Per release | Free |
| Sentry | Error tracking | Continuous | Free-$26/mo |

---

## 13. Quick Reference Commands

```bash
# Full security scan (run all)
cd backend && \
  snyk test && \
  trivy image forge-backend && \
  bandit -r . && \
  gitleaks detect && \
  cd ../frontend && \
  npm audit && \
  npx eslint src/ --ext .ts,.tsx

# Quick scan (pre-commit)
gitleaks detect --no-git && \
  cd backend && bandit -r . -ll

# Generate all reports
mkdir -p security-reports && \
  snyk test --json | snyk-to-html -o security-reports/snyk.html && \
  trivy image forge-backend -f html -o security-reports/trivy.html && \
  bandit -r . -f html -o security-reports/bandit.html
```

---

## 14. Resources

- [OWASP Top 10](https://owasp.org/Top10/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Snyk Vulnerability Database](https://snyk.io/vuln/)
- [CVE Details](https://www.cvedetails.com/)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [OWASP ZAP Documentation](https://www.zaproxy.org/docs/)

---

## Appendix: Sample Security Report

```markdown
# Security Scan Report - 2024-01-15

## Executive Summary
- Total scans: 5
- Critical issues: 0
- High issues: 2
- Medium issues: 5
- Low issues: 12

## Critical Findings
None

## High Severity
1. **SQL Injection in admin search** (backend/api/admin.py:197)
   - CVE: N/A
   - Fix: Input sanitization applied ✅

## Medium Severity
1. **Weak password policy** (backend/core/security.py:98)
   - CVE: N/A
   - Fix: Increased to 12 characters ✅

## Recommendations
1. Implement automated dependency updates (Dependabot)
2. Add security training for developers
3. Schedule quarterly penetration tests
4. Enable bug bounty program

## Next Scan
Scheduled: 2024-01-22
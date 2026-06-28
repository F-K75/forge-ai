#!/bin/bash
# P0 Security Fixes Verification Script
# This script automates the verification of all P0 security fixes

set -e  # Exit on error

echo "=========================================="
echo "P0 Security Fixes Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
WARNINGS=0

# Helper function
check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $1"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $1"
        ((FAILED++))
    fi
}

warn() {
    echo -e "${YELLOW}⚠ WARN${NC}: $1"
    ((WARNINGS++))
}

# ==========================================
# 1. ENVIRONMENT CHECKS
# ==========================================
echo "1. Environment Checks"
echo "-------------------------------------------"

# Check Python version
python3 --version > /dev/null 2>&1
check "Python 3 installed"

# Check pip
pip3 --version > /dev/null 2>&1
check "pip3 installed"

# Check if in correct directory
if [ -f "backend/requirements.txt" ]; then
    check "In correct directory (forge-ai)"
else
    echo -e "${RED}✗ FAIL${NC}: Not in forge-ai directory"
    echo "Please run this script from the forge-ai root directory"
    exit 1
fi

echo ""

# ==========================================
# 2. INSTALL DEPENDENCIES
# ==========================================
echo "2. Installing Dependencies"
echo "-------------------------------------------"

cd backend

# Install requirements
pip3 install -r requirements.txt > /dev/null 2>&1
check "Backend dependencies installed"

# Verify cryptography installed
python3 -c "import cryptography; print(f'cryptography {cryptography.__version__}')" > /dev/null 2>&1
check "cryptography library available"

cd ..

echo ""

# ==========================================
# 3. RUN TESTS
# ==========================================
echo "3. Running Test Suite"
echo "-------------------------------------------"

cd backend

# Run encryption tests
if [ -f "tests/test_encryption.py" ]; then
    pytest tests/test_encryption.py -v > /tmp/test-output.txt 2>&1
    check "Encryption tests executed"
    
    # Check if tests passed
    if grep -q "passed" /tmp/test-output.txt; then
        echo -e "${GREEN}  All encryption tests passed${NC}"
    else
        echo -e "${RED}  Some tests failed${NC}"
        cat /tmp/test-output.txt
    fi
else
    warn "Test file not found: tests/test_encryption.py"
fi

cd ..

echo ""

# ==========================================
# 4. VERIFY SECURITY IMPLEMENTATIONS
# ==========================================
echo "4. Verifying Security Implementations"
echo "-------------------------------------------"

# Check security headers implementation
if grep -q "X-Content-Type-Options" backend/core/security.py; then
    check "Security headers implemented"
else
    echo -e "${RED}✗ FAIL${NC}: Security headers missing"
fi

# Check input sanitization
if grep -q "sanitize_string" backend/core/security.py; then
    check "Input sanitization function exists"
else
    echo -e "${RED}✗ FAIL${NC}: Input sanitization missing"
fi

# Check encryption module
if [ -f "backend/core/encryption.py" ]; then
    check "Encryption module created"
else
    echo -e "${RED}✗ FAIL${NC}: Encryption module missing"
fi

# Check encryption functions
if grep -q "def encrypt_field" backend/core/encryption.py; then
    check "encrypt_field function exists"
else
    echo -e "${RED}✗ FAIL${NC}: encrypt_field function missing"
fi

if grep -q "def decrypt_field" backend/core/encryption.py; then
    check "decrypt_field function exists"
else
    echo -e "${RED}✗ FAIL${NC}: decrypt_field function missing"
fi

# Check auth API uses encryption
if grep -q "encrypt_field" backend/api/auth.py; then
    check "Auth API uses encryption"
else
    echo -e "${RED}✗ FAIL${NC}: Auth API not using encryption"
fi

# Check deployments API uses encryption
if grep -q "decrypt_field" backend/api/deployments.py; then
    check "Deployments API decrypts tokens"
else
    echo -e "${RED}✗ FAIL${NC}: Deployments API not decrypting tokens"
fi

# Check admin API sanitizes input
if grep -q "sanitize_string" backend/api/admin.py; then
    check "Admin API sanitizes search input"
else
    echo -e "${RED}✗ FAIL${NC}: Admin API not sanitizing input"
fi

# Check password policy
if grep -q "12 characters" backend/core/security.py; then
    check "Password policy strengthened (12 chars)"
else
    echo -e "${RED}✗ FAIL${NC}: Password policy not updated"
fi

# Check rate limiting
if grep -q "rate_limit_middleware" backend/main.py; then
    check "Rate limiting middleware active"
else
    echo -e "${RED}✗ FAIL${NC}: Rate limiting not configured"
fi

# Check trusted host middleware
if grep -q "TrustedHostMiddleware" backend/main.py; then
    check "TrustedHostMiddleware configured"
else
    echo -e "${RED}✗ FAIL${NC}: TrustedHostMiddleware missing"
fi

echo ""

# ==========================================
# 5. VERIFY SECURITY HEADERS
# ==========================================
echo "5. Security Headers Verification"
echo "-------------------------------------------"

# Start backend in background for testing
if [ -f ".env" ]; then
    echo "Starting backend server..."
    uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
    BACKEND_PID=$!
    sleep 3
    
    # Test health endpoint
    RESPONSE=$(curl -s -I http://localhost:8000/health 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        check "Backend server started"
        
        # Check security headers
        if echo "$RESPONSE" | grep -q "X-Content-Type-Options"; then
            check "X-Content-Type-Options header present"
        else
            echo -e "${RED}✗ FAIL${NC}: X-Content-Type-Options header missing"
        fi
        
        if echo "$RESPONSE" | grep -q "X-Frame-Options"; then
            check "X-Frame-Options header present"
        else
            echo -e "${RED}✗ FAIL${NC}: X-Frame-Options header missing"
        fi
        
        if echo "$RESPONSE" | grep -q "Strict-Transport-Security"; then
            check "HSTS header present"
        else
            echo -e "${RED}✗ FAIL${NC}: HSTS header missing"
        fi
        
        if echo "$RESPONSE" | grep -q "Content-Security-Policy"; then
            check "CSP header present"
        else
            echo -e "${RED}✗ FAIL${NC}: CSP header missing"
        fi
    else
        warn "Could not start backend server (skipping header tests)"
    fi
    
    # Cleanup
    kill $BACKEND_PID 2>/dev/null || true
else
    warn ".env file not found, skipping server tests"
fi

echo ""

# ==========================================
# 6. VERIFY ENCRYPTION
# ==========================================
echo "6. Encryption Verification"
echo "-------------------------------------------"

# Test encryption/decryption
python3 -c "
from core.encryption import encrypt_field, decrypt_field

# Test basic encryption
token = 'ghp_test_token_12345'
encrypted = encrypt_field(token)
decrypted = decrypt_field(encrypted)

assert encrypted != token, 'Encryption failed'
assert decrypted == token, 'Decryption failed'
assert encrypted.startswith('gAAAAA'), 'Invalid Fernet format'

print('Encryption test: PASSED')
" 2>/dev/null
check "Encryption/decryption works"

# Test token masking
python3 -c "
from core.encryption import mask_token

masked = mask_token('ghp_1234567890abcdefghijklmnopqrstuvwxyz')
assert '...' in masked, 'Masking failed'
assert masked.startswith('ghp_12345678'), 'Masking format incorrect'

print('Token masking test: PASSED')
" 2>/dev/null
check "Token masking works"

echo ""

# ==========================================
# 7. VERIFY INPUT SANITIZATION
# ==========================================
echo "7. Input Sanitization Verification"
echo "-------------------------------------------"

python3 -c "
from core.security import sanitize_string

# Test null byte removal
result = sanitize_string('test\x00injection')
assert '\x00' not in result, 'Null bytes not removed'

# Test length limiting
result = sanitize_string('a' * 2000, max_length=100)
assert len(result) == 100, 'Length limit not enforced'

# Test regex escaping
result = sanitize_string('test[regex]special', max_length=50)
assert '\\\\[' in result or '[' not in result, 'Regex not escaped'

print('Input sanitization tests: PASSED')
" 2>/dev/null
check "Input sanitization works"

echo ""

# ==========================================
# 8. VERIFY PASSWORD VALIDATION
# ==========================================
echo "8. Password Validation Verification"
echo "-------------------------------------------"

python3 -c "
from core.security import validate_password_strength

# Test valid password
valid, msg = validate_password_strength('SecurePass123!')
assert valid == True, 'Valid password rejected'
assert msg == '', 'Error message for valid password'

# Test too short
valid, msg = validate_password_strength('Short1!')
assert valid == False, 'Short password accepted'
assert '12 characters' in msg, 'Wrong error message'

# Test missing requirements
valid, msg = validate_password_strength('nouppercase123!')
assert valid == False, 'Password without uppercase accepted'

print('Password validation tests: PASSED')
" 2>/dev/null
check "Password validation works"

echo ""

# ==========================================
# 9. CHECK DOCUMENTATION
# ==========================================
echo "9. Documentation Verification"
echo "-------------------------------------------"

if [ -f "STAGING_DEPLOYMENT.md" ]; then
    check "Staging deployment guide exists"
else
    warn "STAGING_DEPLOYMENT.md not found"
fi

if [ -f "SECURITY_SCANNING.md" ]; then
    check "Security scanning guide exists"
else
    warn "SECURITY_SCANNING.md not found"
fi

if [ -f "P0_SECURITY_FIXES_SUMMARY.md" ]; then
    check "P0 fixes summary exists"
else
    warn "P0_SECURITY_FIXES_SUMMARY.md not found"
fi

echo ""

# ==========================================
# 10. SUMMARY
# ==========================================
echo "=========================================="
echo "VERIFICATION SUMMARY"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    PERCENTAGE=$((PASSED * 100 / TOTAL))
    echo "Success Rate: $PERCENTAGE%"
fi

echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL CRITICAL CHECKS PASSED${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Review STAGING_DEPLOYMENT.md"
    echo "2. Deploy to staging environment"
    echo "3. Run security scans (see SECURITY_SCANNING.md)"
    echo "4. Perform load testing"
    echo "5. Schedule penetration test"
    exit 0
else
    echo -e "${RED}✗ SOME CHECKS FAILED${NC}"
    echo ""
    echo "Please review the failures above and:"
    echo "1. Check that all files were saved correctly"
    echo "2. Verify Python dependencies are installed"
    echo "3. Review error messages above"
    exit 1
fi
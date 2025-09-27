# Security Guidelines

## Overview

This document outlines the security measures implemented in the MC Server Management project to protect against credential exposure, unauthorized access, and other security vulnerabilities.

## 🔐 Credential Management

### Environment Variables

- **NEVER** commit `.env` files to version control
- Use `.env.example` as a template with placeholder values
- All sensitive credentials must be stored as environment variables
- Use strong, unique passwords and API keys

### Required Environment Variables

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Application Secrets
JWT_SECRET=your_jwt_secret_key
DATABASE_URL=your_database_connection_string

# Frontend Build Variables
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 🛡️ Security Measures Implemented

### 1. Git Security

- `.env` files are added to `.gitignore`
- Pre-commit hooks prevent credential commits
- Credential detection script scans for exposed secrets

### 2. Docker Security

- All containers run as non-root users
- Secrets are passed as environment variables or build arguments
- No hardcoded credentials in Dockerfiles
- Proper file permissions and ownership

### 3. CI/CD Security

- Jenkins uses credential management system
- No secrets in pipeline configuration files
- Secure Docker registry authentication

### 4. Application Security

- JWT tokens for authentication
- Environment-based configuration
- Input validation and sanitization
- Secure API endpoints

## 🔍 Security Validation

### Automated Security Checks

Run comprehensive security validation:

```bash
npm run security:full
```

This includes:

- Credential detection scan
- Dependency vulnerability audit
- Docker security analysis
- Configuration file validation
- Git security verification

### Individual Security Commands

```bash
# Scan for credentials
npm run security:scan

# Run security audit
npm run security:audit

# Full security validation
npm run security:validate
```

## 🚨 Incident Response

### If Credentials Are Exposed

1. **Immediate Actions:**
   - Rotate all exposed credentials immediately
   - Revoke compromised API keys
   - Change database passwords
   - Update JWT secrets

2. **Git History Cleanup:**

   ```bash
   # Remove sensitive files from Git history
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch .env' \
     --prune-empty --tag-name-filter cat -- --all

   # Force push to remote (DANGEROUS - coordinate with team)
   git push origin --force --all
   git push origin --force --tags
   ```

3. **Verification:**
   - Run security validation scripts
   - Verify all credentials are rotated
   - Monitor for unauthorized access
   - Update documentation

## 📋 Security Checklist

### Development Setup

- [ ] `.env` file created with proper values
- [ ] `.env` added to `.gitignore`
- [ ] Pre-commit hooks installed (`npm run prepare`)
- [ ] Security validation passes (`npm run security:validate`)

### Before Deployment

- [ ] All environment variables configured
- [ ] No hardcoded secrets in code
- [ ] Docker containers run as non-root
- [ ] Security audit passes
- [ ] Credentials rotated if previously exposed

### Regular Maintenance

- [ ] Monthly dependency updates
- [ ] Quarterly credential rotation
- [ ] Regular security scans
- [ ] Monitor for new vulnerabilities

## 🔧 Security Tools

### Pre-commit Hooks

- Credential detection
- Code linting
- TypeScript type checking

### Security Scripts

- `detect-credentials.js` - Scans for exposed credentials
- `security-validation.js` - Comprehensive security analysis

### Monitoring

- Automated security reports
- Dependency vulnerability tracking
- Git commit validation

## 📚 Additional Resources

- [OWASP Security Guidelines](https://owasp.org/)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [Supabase Security Documentation](https://supabase.com/docs/guides/auth)

## 🆘 Support

For security-related questions or to report vulnerabilities:

1. Check this documentation first
2. Run security validation scripts
3. Review credential management guidelines
4. Contact the development team for critical issues

---

**Remember: Security is everyone's responsibility. When in doubt, ask for help rather than risk exposure.**

# Credential Management Guide

## Overview

This document outlines secure credential management practices for the MC Server Management project. Following these guidelines is essential to prevent security vulnerabilities and protect sensitive data.

## 🚨 Security Principles

### Never Commit Credentials

- **NEVER** commit real credentials, API keys, passwords, or secrets to version control
- **ALWAYS** use environment variables for sensitive configuration
- **ALWAYS** use placeholder values in example files

### Environment Separation

- Use different credentials for development, staging, and production environments
- Never use production credentials in development environments
- Rotate credentials regularly, especially after security incidents

## 📁 File Structure

```
├── .env                    # Local environment (NEVER commit)
├── .env.example           # Template with placeholders (safe to commit)
├── .env.local             # Local overrides (NEVER commit)
├── .env.development       # Development config (NEVER commit)
├── .env.production        # Production config (NEVER commit)
└── .gitignore             # Must include all .env files
```

## 🔧 Environment Variables

### Required Variables

#### Supabase Configuration

```bash
# Supabase Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres

# Frontend Environment Variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### Application Secrets

```bash
# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters

# Admin Configuration
ADMIN_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_TOKEN=your-secure-bootstrap-token
```

#### Minecraft Server Configuration

```bash
# RCON Configuration
RCON_PASSWORD=your-rcon-password
RCON_HOST=localhost
RCON_PORT=25575
```

### Variable Naming Conventions

- Use `SCREAMING_SNAKE_CASE` for environment variables
- Prefix frontend variables with `VITE_` (for Vite projects)
- Use descriptive names that indicate the purpose
- Group related variables with common prefixes

## 🛡️ Security Best Practices

### 1. Strong Credentials

#### JWT Secrets

- Minimum 32 characters
- Use cryptographically secure random generation
- Include uppercase, lowercase, numbers, and special characters

```bash
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Passwords

- Minimum 12 characters for service passwords
- Use password managers to generate and store
- Never reuse passwords across services

### 2. Environment File Security

#### .env File Protection

```bash
# Ensure .env is in .gitignore
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
echo "!.env.example" >> .gitignore
```

#### File Permissions (Linux/Mac)

```bash
# Restrict access to environment files
chmod 600 .env
chmod 600 .env.*
```

### 3. Credential Rotation

#### Regular Rotation Schedule

- **Production credentials**: Every 90 days
- **Development credentials**: Every 180 days
- **After security incidents**: Immediately
- **When team members leave**: Within 24 hours

#### Rotation Checklist

- [ ] Generate new credentials
- [ ] Update environment variables in all environments
- [ ] Update CI/CD pipeline secrets
- [ ] Update deployment configurations
- [ ] Test all services with new credentials
- [ ] Revoke old credentials
- [ ] Document rotation in security log

## 🔍 Credential Detection

### Pre-commit Hooks

The project includes automated credential detection:

```bash
# Run credential scan manually
npm run security:scan

# Run full security audit
npm run security:audit
```

### Detection Patterns

The system detects:

- API keys and tokens
- JWT tokens
- Database connection strings
- Supabase credentials
- Private keys
- AWS credentials
- GitHub tokens
- Base64 encoded secrets

## 📋 Setup Instructions

### Initial Setup

1. **Copy environment template**

   ```bash
   cp .env.example .env
   ```

2. **Generate secure secrets**

   ```bash
   # JWT Secret
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

   # Bootstrap Token
   node -e "console.log('ADMIN_BOOTSTRAP_TOKEN=' + require('crypto').randomBytes(16).toString('hex'))"
   ```

3. **Configure Supabase**
   - Create new Supabase project
   - Copy URL and keys from project settings
   - Update `.env` with real values

4. **Set up database**
   - Configure database connection
   - Test connectivity
   - Run initial migrations

### Development Environment

1. **Never use production credentials**
2. **Create separate Supabase project for development**
3. **Use test data only**
4. **Document any shared development credentials securely**

### Production Deployment

1. **Use secure credential storage**
   - Environment variables in hosting platform
   - Secret management services (AWS Secrets Manager, etc.)
   - Encrypted configuration files

2. **Verify credential security**
   ```bash
   # Check for exposed credentials before deployment
   npm run security:scan
   ```

## 🚨 Incident Response

### If Credentials Are Exposed

1. **Immediate Actions** (within 1 hour)
   - [ ] Rotate all exposed credentials immediately
   - [ ] Revoke old credentials
   - [ ] Check access logs for unauthorized usage
   - [ ] Remove credentials from version control history

2. **Investigation** (within 24 hours)
   - [ ] Determine scope of exposure
   - [ ] Identify potential unauthorized access
   - [ ] Document incident details
   - [ ] Notify relevant stakeholders

3. **Recovery** (within 48 hours)
   - [ ] Update all systems with new credentials
   - [ ] Verify system functionality
   - [ ] Implement additional security measures
   - [ ] Update security documentation

### Git History Cleanup

If credentials were committed to Git:

```bash
# Remove sensitive files from Git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all

# Force push to rewrite history (coordinate with team)
git push origin --force --all
git push origin --force --tags
```

**⚠️ Warning**: This rewrites Git history. Coordinate with all team members.

## 🔗 External Resources

### Credential Management Tools

- [1Password](https://1password.com/) - Team password management
- [Bitwarden](https://bitwarden.com/) - Open source password manager
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) - Cloud secret storage
- [HashiCorp Vault](https://www.vaultproject.io/) - Enterprise secret management

### Security Guidelines

- [OWASP Secrets Management](https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_credentials)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)

## 📞 Support

For security-related questions or incidents:

- **Security Team**: [Add contact information]
- **Emergency Contact**: [Add emergency contact]
- **Documentation Issues**: Create issue in project repository

---

**Last Updated**: January 27, 2025  
**Version**: 1.0  
**Next Review**: April 27, 2025

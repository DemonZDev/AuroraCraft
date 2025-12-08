# Security Checklist

## Authentication & Authorization

- [x] JWT tokens in HttpOnly cookies (not localStorage)
- [x] Password hashing with bcrypt (cost factor 12)
- [x] Role-based access control (USER, ADMIN)
- [x] Protected routes require authentication
- [x] Admin routes require admin role
- [ ] Password complexity validation (min 8 chars)
- [ ] Session timeout/refresh mechanism
- [ ] Brute force protection on login

## Secrets Management

- [x] Provider credentials encrypted at rest (AES-256-GCM)
- [x] Encryption key in environment variable
- [ ] Use proper secrets manager (Vault, AWS Secrets Manager)
- [ ] Implement key rotation schedule
- [ ] Never log sensitive data
- [ ] Audit access to secrets

## Input Validation

- [x] Zod schema validation on all endpoints
- [x] Path traversal prevention for file operations
- [x] File extension whitelist
- [x] File size limits
- [x] ZIP extraction validation
- [ ] SQL injection prevention (Prisma ORM handles this)
- [ ] XSS prevention in outputs
- [ ] Sanitize LLM outputs before applying to files

## Network Security

- [x] CORS configuration
- [x] Rate limiting on API endpoints
- [x] HTTPS enforcement (in production)
- [ ] CSP headers
- [ ] CSRF tokens for state-changing operations
- [ ] Helmet.js security headers
- [ ] WAF rules for common attacks

## Compilation Security

- [ ] Docker container isolation
- [ ] No network access for build containers
- [ ] Read-only root filesystem
- [ ] Resource limits (CPU, memory, time)
- [ ] Non-root user in containers
- [ ] Sandboxed file access
- [ ] Maven repository proxy/whitelist

## Data Protection

- [x] Database connection encryption (SSL)
- [ ] Data encryption at rest
- [ ] Regular automated backups
- [ ] Backup encryption
- [ ] Data retention policies
- [ ] GDPR compliance (data export/deletion)

## Monitoring & Logging

- [x] Structured logging
- [x] Log table in database
- [ ] Log aggregation (ELK, Loki)
- [ ] Intrusion detection alerts
- [ ] Failed login monitoring
- [ ] Anomaly detection
- [ ] Audit trail for admin actions

## Infrastructure

- [ ] Firewall configuration (80, 443 only)
- [ ] Private subnet for database
- [ ] Load balancer health checks
- [ ] Auto-scaling configuration
- [ ] DDoS protection
- [ ] Regular security patches

## Code Security

- [ ] Dependency vulnerability scanning (npm audit)
- [ ] Static code analysis
- [ ] Regular security reviews
- [ ] Penetration testing
- [ ] Bug bounty program

## Incident Response

- [ ] Incident response plan documented
- [ ] Contact list for security issues
- [ ] Rollback procedures
- [ ] Communication templates
- [ ] Post-incident review process

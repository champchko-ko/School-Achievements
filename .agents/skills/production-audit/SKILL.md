
Production Readiness Audit

Purpose

Perform a complete, evidence-based production readiness audit of the repository.

Rules

- Inspect the entire affected codebase before reaching conclusions.
- Never assume a feature exists because documentation claims it exists.
- Never claim something works without verifying the implementation.
- Never claim tests pass without executing them.
- Never invent missing requirements.
- Never silently simplify requirements.
- Never modify code during the audit unless explicitly instructed.
- Treat unverified assumptions as findings.
- Trace important requirements across frontend, API, backend, database, authorization, infrastructure, and tests.
- Inspect the complete dependency chain for security-critical functionality.
- Use repository evidence for every finding.

Audit Scope

Inspect:

- Application architecture
- Frontend
- Backend
- APIs
- Database and migrations
- Authentication
- Authorization and RBAC
- Tenant and data isolation
- Input validation
- Secrets and environment configuration
- Dependency security
- File and object storage
- Error handling
- Logging and monitoring
- Performance
- Caching
- Concurrency and data consistency
- External integrations
- Tests and test coverage
- Build configuration
- Deployment configuration
- CI/CD
- Backups and recovery
- SEO
- Accessibility
- Production UX
- Security headers and browser security
- Rate limiting and abuse protection

Verification

Run relevant available:

- Unit tests
- Integration tests
- End-to-end tests
- Type checks
- Linting
- Build commands
- Security scans
- Dependency audits

Record exactly which commands were executed and their results.

Do not treat missing tests as passing tests.

Security Review

Check for:

- Authentication bypass
- Authorization bypass
- Broken access control
- Tenant isolation failures
- IDOR
- Injection vulnerabilities
- XSS
- CSRF where applicable
- SSRF
- Unsafe file uploads
- Sensitive information exposure
- Hardcoded secrets
- Weak session handling
- Insecure cookies
- Excessive API permissions
- Missing rate limits
- Insecure CORS
- Security header issues
- Database security problems
- Privilege escalation

Finding Format

For every finding provide:

- ID
- Severity: Critical, High, Medium, or Low
- Category
- Exact file
- Exact location
- Evidence
- Explanation
- Production impact
- Recommended remediation
- Verification method

Never report a vulnerability without evidence.

Requirement Traceability

For each major requirement:

Requirement → Implementation → API → Database → Authorization → Frontend → Tests

Mark each stage as:

- Verified
- Partially verified
- Missing
- Failed
- Not applicable

Final Report

Produce:

1. Executive Summary
2. Production Readiness Verdict
3. Critical Blockers
4. High-Severity Findings
5. Medium-Severity Findings
6. Low-Severity Findings
7. Security Findings
8. Functional Findings
9. Performance Findings
10. Infrastructure and Deployment Findings
11. Testing Gaps
12. Requirement Traceability
13. Executed Verification Commands
14. Prioritized Remediation Plan

Prioritize remediation using:

P0 = Production blocker
P1 = Fix before production
P2 = Fix shortly after release
P3 = Improvement

Do not modify the repository until explicitly authorized.

A production-ready verdict requires evidence. If evidence is insufficient, report the item as unverified rather than assuming it is safe.

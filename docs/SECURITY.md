# Security Documentation - Cartaisy Backend

## Security Overview

Cartaisy Backend implements comprehensive security measures following industry best practices and compliance standards. This document outlines the security architecture, threat mitigation strategies, and operational procedures to ensure maximum protection of data and systems.

### 🔒 Security Principles

1. **Defense in Depth** - Multiple layers of security controls
2. **Zero Trust Architecture** - Never trust, always verify
3. **Principle of Least Privilege** - Minimum necessary access
4. **Security by Design** - Built-in security from the ground up
5. **Continuous Monitoring** - Real-time threat detection and response
6. **Compliance First** - Adherence to industry standards and regulations

## Security Architecture

### 🏗️ Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               SECURITY LAYERS                              │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────┤
│   Network       │   Application   │   Data          │   Infrastructure    │
│   Security      │   Security      │   Security      │   Security          │
│                 │                 │                 │                     │
│ • WAF           │ • Authentication│ • Encryption    │ • Access Control    │
│ • DDoS          │ • Authorization │ • Data Masking  │ • Audit Logging     │
│ • Firewall      │ • Input Valid.  │ • Backup Enc.   │ • Intrusion Det.    │
│ • Rate Limiting │ • CSRF/XSS      │ • Key Mgmt      │ • Vuln. Scanning    │
│ • TLS/SSL       │ • API Security  │ • Data Loss     │ • Compliance        │
│ • VPN Access    │ • Session Mgmt  │   Prevention    │   Monitoring        │
└─────────────────┴─────────────────┴─────────────────┴─────────────────────┘
```

### 🛡️ Threat Model

**Identified Threats and Mitigations**

| Threat Category | Risk Level | Mitigation Strategy | Implementation |
|----------------|------------|-------------------|----------------|
| **Data Breaches** | High | Encryption + Access Control | ✅ Implemented |
| **API Attacks** | High | Rate Limiting + Validation | ✅ Implemented |
| **Injection Attacks** | High | Input Sanitization + ORM | ✅ Implemented |
| **Authentication Bypass** | High | MFA + JWT Security | ✅ Implemented |
| **DDoS Attacks** | Medium | CDN + Rate Limiting | ✅ Implemented |
| **Insider Threats** | Medium | RBAC + Audit Logging | ✅ Implemented |
| **Supply Chain** | Medium | Dependency Scanning | ✅ Implemented |

## Authentication & Authorization

### 🔐 Authentication System

**JWT-Based Authentication**
```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: 'customer' | 'admin' | 'manager';
  permissions: string[];
  sessionId: string;
  iat: number;         // Issued at
  exp: number;         // Expires at
  iss: string;         // Issuer
  aud: string;         // Audience
  jti: string;         // JWT ID
}

// Token Security Features
const tokenConfig = {
  algorithm: 'HS256',
  expiresIn: '1h',           // Short-lived tokens
  refreshExpiresIn: '7d',    // Refresh token rotation
  issuer: 'cartaisy-api',
  audience: 'cartaisy-clients',
  clockTolerance: 30,        // Clock skew tolerance
  ignoreExpiration: false,   // Always validate expiration
  secretRotation: true       // Periodic secret rotation
};
```

**Multi-Factor Authentication (MFA)**
- TOTP (Time-based One-Time Password) support
- SMS-based verification for critical actions
- Email-based verification for account recovery
- Backup codes for account recovery

**Password Security**
```typescript
// Password requirements
const passwordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventCommonPasswords: true,
  preventUserInfoInPassword: true,
  maxAge: 90,              // Days until forced reset
  historyCount: 12,        // Cannot reuse last 12 passwords
  accountLockout: {
    maxAttempts: 5,
    lockoutDuration: 900   // 15 minutes
  }
};

// Secure password hashing
const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = process.env.NODE_ENV === 'production' ? 15 : 12;
  return await bcrypt.hash(password, saltRounds);
};
```

### 👥 Role-Based Access Control (RBAC)

**Permission Matrix**

| Resource | Customer | Manager | Admin | Super Admin |
|----------|----------|---------|--------|-------------|
| **Own Profile** | CRUD | CRUD | CRUD | CRUD |
| **Own Orders** | CR-D | CRUD | CRUD | CRUD |
| **All Orders** | ---- | CR-- | CRUD | CRUD |
| **Products** | CR-- | CRUD | CRUD | CRUD |
| **Users** | ---- | CR-- | CRUD | CRUD |
| **System Config** | ---- | ---- | CR-- | CRUD |
| **Security Logs** | ---- | ---- | CR-- | CRUD |
| **Analytics** | ---- | CR-- | CRUD | CRUD |

**Dynamic Permission System**
```typescript
// Permission definitions
const PERMISSIONS = {
  // User permissions
  'user:read': 'Read user information',
  'user:write': 'Create and update users',
  'user:delete': 'Delete users',
  
  // Order permissions
  'order:read:own': 'Read own orders',
  'order:read:all': 'Read all orders',
  'order:write': 'Create and update orders',
  'order:fulfill': 'Fulfill orders',
  
  // Product permissions
  'product:read': 'Read products',
  'product:write': 'Create and update products',
  'product:delete': 'Delete products',
  
  // System permissions
  'system:config': 'System configuration',
  'system:logs': 'Access system logs',
  'system:backup': 'Database backup operations'
};

// Role-based permission assignment
const checkPermission = (user: User, permission: string): boolean => {
  return user.permissions.includes(permission) || 
         user.permissions.includes('*');
};
```

## Data Protection

### 🔒 Encryption Standards

**Encryption at Rest**
- **Algorithm**: AES-256-GCM
- **Key Management**: AWS KMS / Azure Key Vault
- **Database**: MongoDB encryption at rest enabled
- **File Storage**: Server-side encryption for all uploads
- **Backups**: Encrypted with separate keys

**Encryption in Transit**
- **TLS Version**: 1.3 minimum, 1.2 acceptable
- **Cipher Suites**: ECDHE-RSA-AES256-GCM-SHA384 preferred
- **Certificate**: SHA-256 with RSA 2048-bit minimum
- **HSTS**: Enabled with 2-year max-age
- **Certificate Pinning**: Implemented for mobile apps

```typescript
// TLS Configuration
const tlsConfig = {
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  ciphers: [
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-SHA384',
    'ECDHE-RSA-AES128-SHA256'
  ].join(':'),
  honorCipherOrder: true,
  secureProtocol: 'TLSv1_2_method'
};
```

**Field-Level Encryption**
```typescript
// Sensitive data encryption
const encryptSensitiveField = (data: string): string => {
  const algorithm = 'aes-256-gcm';
  const key = getEncryptionKey('user-data');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipher(algorithm, key);
  cipher.setAAD(Buffer.from('cartaisy-user-data'));
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`;
};

// Fields requiring encryption
const encryptedFields = [
  'user.ssn',
  'user.creditCardNumber',
  'user.bankAccount',
  'payment.cardNumber',
  'payment.cvv'
];
```

### 🗄️ Database Security

**MongoDB Security Configuration**
```javascript
// Authentication and authorization
{
  security: {
    authorization: 'enabled',
    clusterAuthMode: 'x509',
    keyFile: '/etc/mongodb-keyfile'
  },
  
  // Network security
  net: {
    tls: {
      mode: 'requireTLS',
      certificateKeyFile: '/etc/ssl/mongodb.pem',
      CAFile: '/etc/ssl/ca.pem',
      allowInvalidCertificates: false,
      allowInvalidHostnames: false
    },
    bindIpAll: false,
    bindIp: '127.0.0.1,10.0.0.5'
  },
  
  // Audit logging
  auditLog: {
    destination: 'file',
    format: 'JSON',
    path: '/var/log/mongodb/audit.log',
    filter: {
      atype: {
        $in: ['authenticate', 'authCheck', 'createUser', 'dropUser']
      }
    }
  }
}
```

**Query Security**
```typescript
// Prevent NoSQL injection
const sanitizeQuery = (query: any): any => {
  if (typeof query !== 'object' || query === null) {
    return query;
  }
  
  const sanitized = {};
  for (const key in query) {
    if (key.startsWith('$') && !ALLOWED_OPERATORS.includes(key)) {
      continue; // Skip dangerous operators
    }
    
    if (typeof query[key] === 'object') {
      sanitized[key] = sanitizeQuery(query[key]);
    } else {
      sanitized[key] = query[key];
    }
  }
  
  return sanitized;
};

// Allowed MongoDB operators
const ALLOWED_OPERATORS = [
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
  '$in', '$nin', '$and', '$or', '$not',
  '$regex', '$exists', '$type'
];
```

## API Security

### 🛡️ Input Validation & Sanitization

**Request Validation Middleware**
```typescript
import { body, param, query, validationResult } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';

// Input sanitization
const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return DOMPurify.sanitize(obj.trim());
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };
  
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);
  
  next();
};

// Validation rules
const userValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 12 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('name').isLength({ min: 2, max: 100 }).trim().escape(),
  body('phone').optional().isMobilePhone('any')
];
```

### 🔐 CSRF & XSS Protection

**CSRF Token Implementation**
```typescript
import csrf from 'csurf';

// CSRF protection middleware
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  value: (req) => {
    return req.body._csrf || 
           req.query._csrf || 
           req.headers['csrf-token'] ||
           req.headers['x-csrf-token'];
  }
});

// XSS protection headers
const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};
```

### 🚦 Rate Limiting

**Advanced Rate Limiting Strategy**
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Tier-based rate limiting
const rateLimitConfigs = {
  // General API endpoints
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:general:'
    })
  }),
  
  // Authentication endpoints (stricter)
  auth: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Only 5 login attempts per 15 minutes
    skipSuccessfulRequests: true,
    message: 'Too many authentication attempts',
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:auth:'
    })
  }),
  
  // Admin endpoints (most restrictive)
  admin: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: 'Admin rate limit exceeded',
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:admin:'
    })
  })
};

// Adaptive rate limiting based on user behavior
const adaptiveRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const clientIp = req.ip;
  
  // Check for suspicious patterns
  const suspiciousActivity = await checkSuspiciousActivity(user?.id || clientIp);
  
  if (suspiciousActivity.score > 0.8) {
    // Implement CAPTCHA or additional verification
    return res.status(429).json({
      error: 'Additional verification required',
      requiresCaptcha: true
    });
  }
  
  next();
};
```

## Infrastructure Security

### 🏗️ Network Security

**Firewall Configuration**
```bash
# Ubuntu UFW configuration
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH (restricted to specific IPs)
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw deny 3000/tcp   # Block direct app access
ufw enable

# Advanced rules
ufw allow from 10.0.0.0/8 to any port 3000    # Internal network only
ufw allow from 192.168.1.0/24 to any port 22  # SSH from admin network
```

**VPC Security Groups (AWS)**
```json
{
  "SecurityGroups": [
    {
      "GroupName": "cartaisy-web-tier",
      "Rules": [
        {
          "Type": "ingress",
          "Protocol": "tcp",
          "Port": 443,
          "Source": "0.0.0.0/0"
        },
        {
          "Type": "ingress",
          "Protocol": "tcp",
          "Port": 80,
          "Source": "0.0.0.0/0"
        }
      ]
    },
    {
      "GroupName": "cartaisy-app-tier",
      "Rules": [
        {
          "Type": "ingress",
          "Protocol": "tcp",
          "Port": 3000,
          "Source": "sg-web-tier"
        }
      ]
    },
    {
      "GroupName": "cartaisy-db-tier",
      "Rules": [
        {
          "Type": "ingress",
          "Protocol": "tcp",
          "Port": 27017,
          "Source": "sg-app-tier"
        }
      ]
    }
  ]
}
```

### 🔍 Monitoring & Intrusion Detection

**Security Event Monitoring**
```typescript
// Security event logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: '/var/log/cartaisy/security.log' 
    }),
    new winston.transports.File({ 
      filename: '/var/log/cartaisy/security-error.log', 
      level: 'error' 
    })
  ]
});

// Security events to monitor
const SecurityEvents = {
  FAILED_LOGIN: 'FAILED_LOGIN',
  SUCCESSFUL_LOGIN: 'SUCCESSFUL_LOGIN',
  PRIVILEGE_ESCALATION: 'PRIVILEGE_ESCALATION',
  SUSPICIOUS_QUERY: 'SUSPICIOUS_QUERY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  DATA_EXPORT: 'DATA_EXPORT',
  CONFIGURATION_CHANGE: 'CONFIGURATION_CHANGE'
};

// Log security event
const logSecurityEvent = (event: string, details: any) => {
  securityLogger.info({
    event,
    timestamp: new Date().toISOString(),
    ip: details.ip,
    userAgent: details.userAgent,
    userId: details.userId,
    details: details.data
  });
  
  // Send to SIEM if configured
  if (process.env.SIEM_ENDPOINT) {
    sendToSIEM(event, details);
  }
};
```

**Intrusion Detection Rules**
```typescript
// Automated threat detection
const threatDetection = {
  // Multiple failed logins from same IP
  bruteForceDetection: async (ip: string) => {
    const failedAttempts = await redis.get(`failed_login:${ip}`);
    if (parseInt(failedAttempts || '0') > 10) {
      await blockIP(ip, '1h');
      await alertSecurity('Brute force detected', { ip });
    }
  },
  
  // Unusual API usage patterns
  anomalyDetection: async (userId: string, endpoint: string) => {
    const pattern = await analyzeUserPattern(userId, endpoint);
    if (pattern.anomalyScore > 0.9) {
      await flagUser(userId, 'unusual_activity');
      await alertSecurity('Anomalous behavior detected', { userId, endpoint });
    }
  },
  
  // SQL injection attempts
  injectionDetection: (query: string) => {
    const sqlInjectionPatterns = [
      /(\s|^|\')union(\s|$)/i,
      /(\s|^|\')select(\s|$)/i,
      /(\s|^|\')insert(\s|$)/i,
      /(\s|^|\')update(\s|$)/i,
      /(\s|^|\')delete(\s|$)/i,
      /(\s|^|\')drop(\s|$)/i
    ];
    
    return sqlInjectionPatterns.some(pattern => pattern.test(query));
  }
};
```

## Compliance & Audit

### 📋 Compliance Standards

**GDPR Compliance**
```typescript
// GDPR data handling
const gdprCompliance = {
  // Right to be forgotten
  deleteUserData: async (userId: string) => {
    await User.findByIdAndUpdate(userId, {
      $set: {
        email: `deleted-${userId}@anonymized.local`,
        name: 'DELETED',
        phone: null,
        address: null,
        personalData: null,
        gdprDeleted: true,
        deletedAt: new Date()
      }
    });
    
    // Anonymize order data
    await Order.updateMany(
      { customer: userId },
      { $set: { customerData: null } }
    );
  },
  
  // Data export
  exportUserData: async (userId: string) => {
    const userData = await User.findById(userId).lean();
    const orders = await Order.find({ customer: userId }).lean();
    
    return {
      personalData: userData,
      orderHistory: orders,
      exportDate: new Date().toISOString(),
      format: 'JSON'
    };
  },
  
  // Consent management
  updateConsent: async (userId: string, consents: ConsentTypes) => {
    await User.findByIdAndUpdate(userId, {
      $set: {
        'privacy.marketing': consents.marketing,
        'privacy.analytics': consents.analytics,
        'privacy.functional': consents.functional,
        'privacy.consentDate': new Date()
      }
    });
  }
};
```

**PCI DSS Compliance**
```typescript
// PCI DSS requirements implementation
const pciCompliance = {
  // Never store sensitive authentication data
  processPayment: async (paymentData: PaymentData) => {
    // Tokenize card data immediately
    const token = await paymentProcessor.tokenize(paymentData.cardNumber);
    
    // Store only the token, never the actual card number
    const payment = {
      token,
      last4: paymentData.cardNumber.slice(-4),
      expiryMonth: paymentData.expiryMonth,
      expiryYear: paymentData.expiryYear,
      // CVV is never stored
      cardholderName: paymentData.cardholderName
    };
    
    return payment;
  },
  
  // Secure transmission of cardholder data
  encryptCardData: (cardData: string): string => {
    const algorithm = 'aes-256-gcm';
    const key = getPCIEncryptionKey();
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(cardData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}:${cipher.getAuthTag().toString('hex')}`;
  }
};
```

### 📝 Audit Logging

**Comprehensive Audit Trail**
```typescript
// Audit log schema
interface AuditLog {
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  ip: string;
  userAgent: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  result: 'success' | 'failure';
  errorMessage?: string;
  riskScore: number;
}

// Audit middleware
const auditMiddleware = (action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Capture original response methods
    const originalSend = res.send;
    let responseBody: any;
    
    res.send = function(body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };
    
    // Log the audit entry after response
    res.on('finish', async () => {
      const auditEntry: AuditLog = {
        timestamp: new Date(),
        userId: req.user?.id,
        sessionId: req.sessionID,
        ip: req.ip,
        userAgent: req.get('User-Agent') || '',
        action,
        resource: req.originalUrl,
        resourceId: req.params.id,
        result: res.statusCode < 400 ? 'success' : 'failure',
        errorMessage: res.statusCode >= 400 ? responseBody?.error : undefined,
        riskScore: calculateRiskScore(req, res)
      };
      
      await saveAuditLog(auditEntry);
    });
    
    next();
  };
};

// Risk scoring
const calculateRiskScore = (req: Request, res: Response): number => {
  let score = 0;
  
  // High-risk actions
  const highRiskActions = [
    'DELETE', 'admin', 'config', 'backup', 'user:delete'
  ];
  
  if (highRiskActions.some(action => 
    req.method === action || req.originalUrl.includes(action)
  )) {
    score += 0.7;
  }
  
  // Failed operations
  if (res.statusCode >= 400) {
    score += 0.3;
  }
  
  // Off-hours access
  const hour = new Date().getHours();
  if (hour < 6 || hour > 22) {
    score += 0.2;
  }
  
  return Math.min(score, 1.0);
};
```

## Incident Response

### 🚨 Security Incident Response Plan

**Incident Classification**

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **Level 1 - Critical** | Active data breach, system compromise | 15 minutes | CISO, CEO |
| **Level 2 - High** | Attempted breach, service disruption | 1 hour | Security Team Lead |
| **Level 3 - Medium** | Suspicious activity, failed attacks | 4 hours | On-duty Engineer |
| **Level 4 - Low** | Policy violations, minor issues | 24 hours | Weekly Review |

**Response Procedures**

```typescript
// Incident response automation
const incidentResponse = {
  // Immediate containment
  containThreat: async (threatType: string, source: string) => {
    switch (threatType) {
      case 'brute_force':
        await blockIP(source, '24h');
        break;
      case 'sql_injection':
        await blockIP(source, '24h');
        await disableEndpoint(req.originalUrl, '1h');
        break;
      case 'data_exfiltration':
        await blockUser(source, 'indefinite');
        await alertEmergencyTeam();
        break;
    }
  },
  
  // Evidence collection
  collectEvidence: async (incidentId: string) => {
    return {
      logs: await getSecurityLogs(incidentId),
      systemState: await captureSystemState(),
      networkTraffic: await getNetworkLogs(incidentId),
      affectedUsers: await getAffectedUsers(incidentId)
    };
  },
  
  // Communication
  notifyStakeholders: async (incident: SecurityIncident) => {
    if (incident.level <= 2) {
      await sendEmergencyAlert(incident);
    }
    
    await updateStatusPage(incident);
    await logIncidentReport(incident);
  }
};
```

## Security Testing

### 🧪 Security Testing Framework

**Automated Security Tests**
```typescript
// Security test suite
describe('Security Tests', () => {
  describe('Authentication', () => {
    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(response.status).toBe(401);
    });
    
    it('should enforce rate limiting on auth endpoints', async () => {
      const promises = Array(10).fill(0).map(() =>
        request(app)
          .post('/api/auth/login')
          .send({ email: 'test@test.com', password: 'wrong' })
      );
      
      const responses = await Promise.all(promises);
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });
  
  describe('Input Validation', () => {
    it('should prevent XSS attacks', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      const response = await request(app)
        .post('/api/users')
        .send({ name: xssPayload })
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.body.data.name).not.toContain('<script>');
    });
    
    it('should prevent SQL injection in NoSQL queries', async () => {
      const injectionPayload = { $where: 'function() { return true; }' };
      const response = await request(app)
        .get('/api/products')
        .query(injectionPayload);
      
      expect(response.status).toBe(400);
    });
  });
});
```

**Penetration Testing Checklist**
- [ ] Authentication bypass attempts
- [ ] Authorization escalation tests
- [ ] Input validation fuzzing
- [ ] SQL/NoSQL injection tests
- [ ] XSS vulnerability scanning
- [ ] CSRF protection verification
- [ ] Rate limiting effectiveness
- [ ] Session management security
- [ ] Cryptographic implementation review
- [ ] Infrastructure security assessment

## Security Monitoring

### 📊 Security Metrics & KPIs

**Key Security Indicators**
```typescript
// Security metrics collection
const securityMetrics = {
  // Authentication metrics
  authenticationMetrics: {
    failedLoginRate: 0.02,      // < 2% failed login rate
    mfaAdoptionRate: 0.85,      // > 85% MFA adoption
    passwordResetRate: 0.01,    // < 1% daily password resets
    sessionTimeoutRate: 0.1     // 10% sessions timeout naturally
  },
  
  // Threat detection metrics
  threatMetrics: {
    blockedIPsPerDay: 15,       // Average IPs blocked
    suspiciousActivityAlerts: 5, // Daily suspicious activity alerts
    incidentResponseTime: 12,    // Minutes to initial response
    falsePositiveRate: 0.05     // < 5% false positive rate
  },
  
  // Compliance metrics
  complianceMetrics: {
    auditLogCompleteness: 0.999, // 99.9% audit log coverage
    dataRetentionCompliance: 1.0, // 100% compliant data retention
    vulnerabilityPatchTime: 48,   // Hours to patch critical vulns
    securityTrainingCompletion: 0.95 // 95% staff training completion
  }
};

// Automated security reporting
const generateSecurityReport = async (period: string) => {
  return {
    period,
    generatedAt: new Date(),
    metrics: await collectSecurityMetrics(period),
    incidents: await getSecurityIncidents(period),
    threats: await getThreatIntelligence(period),
    recommendations: await generateSecurityRecommendations(),
    complianceStatus: await checkComplianceStatus()
  };
};
```

## Maintenance & Updates

### 🔄 Security Maintenance Schedule

**Regular Security Tasks**

| Task | Frequency | Owner | Due Date |
|------|-----------|-------|----------|
| **Security patch updates** | Weekly | DevOps | Every Tuesday |
| **Vulnerability scans** | Weekly | Security Team | Every Friday |
| **Access review** | Monthly | Security Team | 1st of month |
| **Penetration testing** | Quarterly | External Firm | Quarterly |
| **Security training** | Quarterly | HR + Security | Quarterly |
| **Incident response drill** | Bi-annually | All Teams | Jul/Dec |
| **Security audit** | Annually | External Auditor | December |

**Update Management Process**
```bash
#!/bin/bash
# Security update automation script

# 1. Check for security updates
sudo apt update
SECURITY_UPDATES=$(apt list --upgradable 2>/dev/null | grep -i security | wc -l)

if [ $SECURITY_UPDATES -gt 0 ]; then
    echo "Security updates available: $SECURITY_UPDATES"
    
    # 2. Create backup before updates
    ./scripts/backup-database.js --type=pre-update
    
    # 3. Apply security updates
    sudo apt upgrade -y
    
    # 4. Restart services if needed
    sudo systemctl restart cartaisy-backend
    
    # 5. Run health checks
    sleep 30
    curl -f http://localhost:3000/api/health || exit 1
    
    # 6. Log update completion
    echo "Security updates completed successfully" | \
        logger -t cartaisy-security-update
else
    echo "No security updates available"
fi
```

---

## Emergency Contacts

### 🆘 Security Emergency Response

**24/7 Security Hotline**: +1-555-SEC-HELP

**Emergency Contacts**:
- **CISO**: security-chief@cartaisy.com | +1-555-123-9999
- **Security Team**: security-team@cartaisy.com | +1-555-123-8888
- **DevOps Lead**: devops-lead@cartaisy.com | +1-555-123-7777

**External Partners**:
- **Cyber Insurance**: insurance@cyberinsurer.com | +1-800-CYBER-01
- **Legal Counsel**: legal@lawfirm.com | +1-555-LAW-FIRM
- **Law Enforcement**: FBI IC3 | local law enforcement

---

This security documentation is a living document and should be reviewed and updated regularly to address emerging threats and changing compliance requirements.
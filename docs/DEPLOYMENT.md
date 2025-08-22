# Deployment Guide for Cartaisy Backend

This guide provides comprehensive instructions for deploying Cartaisy Backend to production environments.

## Overview

Cartaisy Backend is designed for flexible deployment across multiple environments - from single-server deployments to enterprise-scale cloud infrastructures. This guide covers:

- Server requirements and preparation
- Database setup options
- Environment configuration
- Deployment processes
- SSL and security setup
- Monitoring and maintenance

## Server Requirements

### Minimum Requirements
- **CPU**: 2 vCPUs (4+ recommended for production)
- **Memory**: 4GB RAM (8GB+ recommended)
- **Storage**: 20GB SSD (50GB+ for production)
- **Network**: Stable internet connection with >10Mbps
- **OS**: Ubuntu 20.04 LTS or newer (CentOS/RHEL also supported)

### Recommended Production Specs
- **CPU**: 4-8 vCPUs
- **Memory**: 8-16GB RAM
- **Storage**: 100GB+ SSD with backup capability
- **Network**: High-speed connection with CDN integration
- **Load Balancer**: nginx or cloud load balancer

### Node.js Requirements
```bash
# Required Node.js version
node --version  # Must be >= 18.0.0

# Required npm version
npm --version   # Must be >= 8.0.0

# Install Node.js on Ubuntu
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version && npm --version
```

## MongoDB Setup Options

### Option 1: MongoDB Atlas (Recommended)

MongoDB Atlas provides managed MongoDB with automatic scaling, backups, and monitoring.

1. **Create Atlas Account**
   ```bash
   # Visit https://cloud.mongodb.com
   # Create account and new project
   ```

2. **Create Cluster**
   ```bash
   # Choose cloud provider (AWS/Azure/GCP)
   # Select region closest to your application
   # Choose cluster tier (M10+ for production)
   ```

3. **Configure Security**
   ```bash
   # Add database user with read/write permissions
   # Configure IP whitelist (0.0.0.0/0 for development)
   # Note down connection string
   ```

4. **Connection String Format**
   ```bash
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
   ```

### Option 2: Self-Hosted MongoDB

For full control and compliance requirements:

1. **Install MongoDB**
   ```bash
   # Ubuntu installation
   wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
   echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
   sudo apt-get update
   sudo apt-get install -y mongodb-org
   ```

2. **Configure MongoDB**
   ```bash
   # Edit configuration
   sudo nano /etc/mongod.conf
   
   # Enable authentication and set bind IP
   security:
     authorization: enabled
   net:
     port: 27017
     bindIp: 127.0.0.1,<your-server-ip>
   ```

3. **Start and Enable MongoDB**
   ```bash
   sudo systemctl start mongod
   sudo systemctl enable mongod
   ```

4. **Create Database User**
   ```bash
   mongosh
   use admin
   db.createUser({
     user: "cartaisy",
     pwd: "your-secure-password",
     roles: ["readWriteAnyDatabase"]
   })
   ```

## Environment Configuration Checklist

### 1. Required Environment Variables
```bash
# Core Configuration
NODE_ENV=production
PORT=3000
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-super-secure-jwt-secret

# Security
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Shopify Integration (if applicable)
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your-access-token

# Email Configuration
EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=your-email-api-key
EMAIL_FROM=noreply@yourdomain.com

# Frontend URL for CORS
FRONTEND_URL=https://yourdomain.com

# Optional: External Services
REDIS_URL=redis://localhost:6379
SENTRY_DSN=your-sentry-dsn
```

### 2. Security Configuration
```bash
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate secure session secret
openssl rand -hex 32

# Create .env file with proper permissions
touch .env
chmod 600 .env
```

## Step-by-Step Deployment Process

### 1. Server Preparation
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create application user
sudo adduser --system --group cartaisy
```

### 2. Application Deployment
```bash
# Switch to application user
sudo su - cartaisy

# Clone repository
git clone https://github.com/your-org/cartaisy-backend.git
cd cartaisy-backend

# Install dependencies
npm ci --only=production

# Create production environment file
cp .env.template.production .env
nano .env  # Configure all required variables

# Build application
npm run build

# Test application
npm start  # Should start without errors
```

### 3. PM2 Process Management
```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'cartaisy-backend',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/cartaisy/error.log',
    out_file: '/var/log/cartaisy/out.log',
    log_file: '/var/log/cartaisy/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 5000
  }]
}
EOF

# Create log directory
sudo mkdir -p /var/log/cartaisy
sudo chown cartaisy:cartaisy /var/log/cartaisy

# Start application with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Generate startup script
pm2 startup
# Follow the instructions to run the generated command
```

## SSL Certificate Setup

### Using Let's Encrypt (Free)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run

# Setup automatic renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### nginx Configuration
```bash
# Create nginx configuration
sudo nano /etc/nginx/sites-available/cartaisy-backend

# Add configuration:
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/cartaisy-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Domain Configuration

### DNS Setup
```bash
# Add DNS records for your domain:
# A Record: yourdomain.com → your-server-ip
# CNAME Record: www.yourdomain.com → yourdomain.com
# Optional: CNAME Record: api.yourdomain.com → yourdomain.com
```

### Firewall Configuration
```bash
# Configure UFW firewall
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Verify firewall status
sudo ufw status
```

## Health Check Verification

### 1. Basic Health Check
```bash
# Test health endpoint
curl https://yourdomain.com/api/health

# Expected response:
{
  "success": true,
  "message": "API Server is running",
  "database": "connected",
  "environment": "production"
}
```

### 2. Detailed System Check
```bash
# Test detailed health endpoint
curl https://yourdomain.com/api/health/detailed

# Test database connectivity
curl https://yourdomain.com/api/health/database

# Test Shopify integration (if configured)
curl https://yourdomain.com/api/health/shopify
```

### 3. Load Testing
```bash
# Install artillery for load testing
npm install -g artillery

# Create load test configuration
cat > load-test.yml << EOF
config:
  target: 'https://yourdomain.com'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Health check"
    requests:
      - get:
          url: "/api/health"
EOF

# Run load test
artillery run load-test.yml
```

## Monitoring Setup Recommendations

### 1. Application Monitoring
```bash
# Install and configure Sentry
npm install @sentry/node @sentry/integrations

# Add to your environment variables
SENTRY_DSN=your-sentry-dsn

# Optional: New Relic
npm install newrelic
NEW_RELIC_LICENSE_KEY=your-license-key
```

### 2. Server Monitoring
```bash
# Install monitoring agents
# For DigitalOcean Droplets
curl -sSL https://insights.nyc3.cdn.digitaloceanspaces.com/install.sh | sudo bash

# For AWS CloudWatch
sudo apt install awscli
aws configure

# For custom monitoring
sudo apt install htop iotop nethogs
```

### 3. Log Management
```bash
# Configure log rotation
sudo nano /etc/logrotate.d/cartaisy

# Add configuration:
/var/log/cartaisy/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 cartaisy cartaisy
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Backup and Recovery Procedures

### 1. Database Backups
```bash
# MongoDB Atlas: Automatic backups enabled by default

# Self-hosted MongoDB backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/mongodb"
mkdir -p $BACKUP_DIR

mongodump --uri="$MONGODB_URI" --out "$BACKUP_DIR/backup_$DATE"
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" -C "$BACKUP_DIR" "backup_$DATE"
rm -rf "$BACKUP_DIR/backup_$DATE"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
```

### 2. Application Backups
```bash
# Create application backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/cartaisy"
APP_DIR="/home/cartaisy/cartaisy-backend"

mkdir -p $BACKUP_DIR
tar -czf "$BACKUP_DIR/app_backup_$DATE.tar.gz" -C "$APP_DIR" .
```

### 3. Automated Backup Schedule
```bash
# Add to crontab
sudo crontab -e

# Daily database backup at 2 AM
0 2 * * * /opt/scripts/backup-mongodb.sh

# Weekly application backup on Sundays at 3 AM
0 3 * * 0 /opt/scripts/backup-application.sh
```

## Scaling Considerations

### Horizontal Scaling
```bash
# Load balancer configuration for multiple instances
upstream cartaisy_backend {
    server 10.0.1.10:3000;
    server 10.0.1.11:3000;
    server 10.0.1.12:3000;
}

server {
    location / {
        proxy_pass http://cartaisy_backend;
    }
}
```

### Database Scaling
```bash
# MongoDB Atlas: Enable auto-scaling
# Self-hosted: Configure replica sets

# Redis caching for session management
sudo apt install redis-server
sudo systemctl enable redis-server

# Add to environment variables
REDIS_URL=redis://localhost:6379
```

### CDN Integration
```bash
# CloudFlare setup for static assets
# Configure CNAME for static.yourdomain.com
# Enable caching rules for images and API responses
```

## Troubleshooting Deployment Issues

### Common Issues and Solutions

#### 1. Application Won't Start
```bash
# Check logs
pm2 logs cartaisy-backend

# Common causes:
# - Missing environment variables
# - Database connection issues
# - Port conflicts
# - Permission issues

# Verify environment
cd /home/cartaisy/cartaisy-backend
node -e "require('dotenv').config(); console.log(process.env.NODE_ENV)"
```

#### 2. Database Connection Errors
```bash
# Test MongoDB connectivity
mongosh "$MONGODB_URI"

# Common issues:
# - Incorrect connection string
# - IP whitelist configuration
# - Authentication credentials
# - Network connectivity
```

#### 3. SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Check nginx configuration
sudo nginx -t
```

#### 4. Performance Issues
```bash
# Monitor system resources
htop
iotop
pm2 monit

# Check application metrics
pm2 show cartaisy-backend

# Monitor database performance
mongosh "$MONGODB_URI" --eval "db.stats()"
```

### Emergency Recovery Procedures

#### 1. Database Recovery
```bash
# Restore from backup
mongorestore --uri="$MONGODB_URI" /var/backups/mongodb/backup_latest/
```

#### 2. Application Rollback
```bash
# Rollback to previous version
cd /home/cartaisy/cartaisy-backend
git checkout previous-stable-tag
npm ci --only=production
npm run build
pm2 restart cartaisy-backend
```

#### 3. Quick Failover
```bash
# Switch to backup server
# Update DNS records to point to backup server
# Restore latest database backup
# Deploy application code
```

## Post-Deployment Checklist

- [ ] Health checks passing on all endpoints
- [ ] SSL certificate installed and working
- [ ] Database connections stable
- [ ] PM2 process management configured
- [ ] Monitoring and alerting set up
- [ ] Backup procedures tested
- [ ] Firewall rules configured
- [ ] DNS records updated
- [ ] Load testing completed
- [ ] Documentation updated

## Maintenance Windows

### Regular Maintenance Tasks
- **Weekly**: Review logs and performance metrics
- **Monthly**: Apply security updates and patches
- **Quarterly**: Review and update dependencies
- **Annually**: Review architecture and scaling needs

### Planned Maintenance Schedule
```bash
# Schedule maintenance during low-traffic periods
# Typically: Sunday 2-4 AM local time
# Notify users 48 hours in advance
# Have rollback plan ready
```

For additional support and enterprise deployment assistance, contact our deployment team at deployments@cartaisy.com
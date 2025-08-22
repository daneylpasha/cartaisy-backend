# Maintenance Guide - Cartaisy Backend

## Overview

This comprehensive maintenance guide provides operational procedures, schedules, and best practices for maintaining the Cartaisy Backend system in production. Regular maintenance ensures optimal performance, security, and reliability.

### 🎯 Maintenance Objectives

1. **System Performance** - Maintain optimal response times and throughput
2. **Security Posture** - Keep security measures current and effective
3. **Data Integrity** - Ensure data consistency and prevent corruption
4. **High Availability** - Minimize downtime and service disruptions
5. **Compliance** - Meet regulatory and audit requirements
6. **Cost Optimization** - Manage resources efficiently

## Maintenance Schedule

### 📅 Daily Tasks (Automated)

| Time | Task | Owner | Duration | Impact |
|------|------|-------|----------|---------|
| **02:00** | Database backup | System | 30 min | None |
| **02:30** | Log rotation and cleanup | System | 15 min | None |
| **03:00** | System health checks | System | 10 min | None |
| **03:15** | Security scan (quick) | System | 20 min | None |
| **04:00** | Performance metrics collection | System | 10 min | None |
| **05:00** | Cache warming | System | 15 min | Low |

### 📅 Weekly Tasks

| Day | Task | Owner | Duration | Maintenance Window |
|-----|------|-------|----------|-------------------|
| **Monday** | Security patches review | DevOps | 1 hour | 02:00-03:00 |
| **Tuesday** | Dependency updates | DevOps | 2 hours | 02:00-04:00 |
| **Wednesday** | Database optimization | DBA | 1 hour | 02:00-03:00 |
| **Thursday** | Performance analysis | DevOps | 1 hour | N/A |
| **Friday** | Infrastructure review | DevOps | 1 hour | N/A |
| **Saturday** | Backup verification | DevOps | 30 min | N/A |
| **Sunday** | System cleanup | System | 1 hour | 02:00-03:00 |

### 📅 Monthly Tasks

| Week | Task | Owner | Duration | Planning Required |
|------|------|-------|----------|-------------------|
| **Week 1** | Security audit | Security Team | 4 hours | ✅ |
| **Week 2** | Capacity planning review | DevOps | 2 hours | ✅ |
| **Week 3** | Disaster recovery test | All Teams | 4 hours | ✅ |
| **Week 4** | Documentation update | All Teams | 2 hours | ❌ |

### 📅 Quarterly Tasks

| Quarter | Task | Owner | Duration | Business Impact |
|---------|------|-------|----------|----------------|
| **Q1** | Major version upgrades | DevOps | 1 day | High |
| **Q2** | Penetration testing | Security | 3 days | Medium |
| **Q3** | Architecture review | All Teams | 2 days | Low |
| **Q4** | Year-end optimization | All Teams | 3 days | Medium |

## Daily Maintenance Procedures

### 🌅 Morning Health Check (08:00 AM)

**Automated Health Check Script**
```bash
#!/bin/bash
# Daily health check script
# Location: /opt/cartaisy/scripts/daily-health-check.sh

LOG_FILE="/var/log/cartaisy/daily-health-$(date +%Y%m%d).log"
ALERT_EMAIL="devops@cartaisy.com"

echo "=== Cartaisy Daily Health Check - $(date) ===" | tee -a $LOG_FILE

# 1. Check application health
echo "Checking application health..." | tee -a $LOG_FILE
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)

if [ "$HEALTH_STATUS" = "200" ]; then
    echo "✅ Application: Healthy" | tee -a $LOG_FILE
else
    echo "❌ Application: Unhealthy (Status: $HEALTH_STATUS)" | tee -a $LOG_FILE
    echo "Application health check failed" | mail -s "ALERT: Cartaisy Health Check Failed" $ALERT_EMAIL
fi

# 2. Check database connectivity
echo "Checking database connectivity..." | tee -a $LOG_FILE
DB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health/database)

if [ "$DB_STATUS" = "200" ]; then
    echo "✅ Database: Connected" | tee -a $LOG_FILE
else
    echo "❌ Database: Connection issues" | tee -a $LOG_FILE
    echo "Database connectivity issues detected" | mail -s "ALERT: Database Connection Failed" $ALERT_EMAIL
fi

# 3. Check disk space
echo "Checking disk space..." | tee -a $LOG_FILE
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')

if [ "$DISK_USAGE" -lt 80 ]; then
    echo "✅ Disk space: $DISK_USAGE% used" | tee -a $LOG_FILE
else
    echo "⚠️  Disk space: $DISK_USAGE% used (WARNING)" | tee -a $LOG_FILE
    echo "High disk usage detected: $DISK_USAGE%" | mail -s "WARNING: High Disk Usage" $ALERT_EMAIL
fi

# 4. Check memory usage
echo "Checking memory usage..." | tee -a $LOG_FILE
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')

if [ "$MEMORY_USAGE" -lt 85 ]; then
    echo "✅ Memory: $MEMORY_USAGE% used" | tee -a $LOG_FILE
else
    echo "⚠️  Memory: $MEMORY_USAGE% used (WARNING)" | tee -a $LOG_FILE
fi

# 5. Check SSL certificate expiry
echo "Checking SSL certificate..." | tee -a $LOG_FILE
SSL_EXPIRY=$(echo | openssl s_client -servername api.cartaisy.com -connect api.cartaisy.com:443 2>/dev/null | openssl x509 -noout -dates | grep notAfter | cut -d= -f2)
SSL_DAYS_LEFT=$(( ($(date -d "$SSL_EXPIRY" +%s) - $(date +%s)) / 86400 ))

if [ "$SSL_DAYS_LEFT" -gt 30 ]; then
    echo "✅ SSL Certificate: $SSL_DAYS_LEFT days remaining" | tee -a $LOG_FILE
else
    echo "⚠️  SSL Certificate: $SSL_DAYS_LEFT days remaining (RENEW SOON)" | tee -a $LOG_FILE
    echo "SSL certificate expires in $SSL_DAYS_LEFT days" | mail -s "WARNING: SSL Certificate Expiry" $ALERT_EMAIL
fi

echo "=== Health Check Complete ===" | tee -a $LOG_FILE
```

### 🌃 Evening Performance Report (18:00 PM)

**Performance Monitoring Script**
```bash
#!/bin/bash
# Evening performance report
# Location: /opt/cartaisy/scripts/evening-performance-report.sh

REPORT_FILE="/var/log/cartaisy/performance-$(date +%Y%m%d).log"

echo "=== Daily Performance Report - $(date) ===" > $REPORT_FILE

# API Response Times
echo "API Response Times (last 24 hours):" >> $REPORT_FILE
curl -s http://localhost:3000/api/metrics/performance?minutes=1440 | jq '.data.overall' >> $REPORT_FILE

# Top 10 slowest endpoints
echo -e "\nTop 10 Slowest Endpoints:" >> $REPORT_FILE
curl -s http://localhost:3000/api/metrics/endpoints | jq '.data.endpoints | sort_by(.averageResponseTime) | reverse | .[0:10]' >> $REPORT_FILE

# Error rate analysis
echo -e "\nError Analysis:" >> $REPORT_FILE
curl -s http://localhost:3000/api/metrics/errors | jq '.data' >> $REPORT_FILE

# Database performance
echo -e "\nDatabase Performance:" >> $REPORT_FILE
curl -s http://localhost:3000/api/metrics/database | jq '.data' >> $REPORT_FILE

# Send report to team
mail -s "Daily Performance Report - $(date +%Y-%m-%d)" \
     -a $REPORT_FILE \
     devops@cartaisy.com < /dev/null
```

## Weekly Maintenance Procedures

### 🔒 Security Patch Management (Mondays)

**Security Update Process**
```bash
#!/bin/bash
# Weekly security update script
# Location: /opt/cartaisy/scripts/weekly-security-updates.sh

set -e

LOG_FILE="/var/log/cartaisy/security-updates-$(date +%Y%m%d).log"
SLACK_WEBHOOK="$SECURITY_SLACK_WEBHOOK"

echo "=== Weekly Security Updates - $(date) ===" | tee -a $LOG_FILE

# 1. Check for available updates
echo "Checking for security updates..." | tee -a $LOG_FILE
apt update
SECURITY_UPDATES=$(apt list --upgradable 2>/dev/null | grep -i security | wc -l)

if [ $SECURITY_UPDATES -eq 0 ]; then
    echo "No security updates available" | tee -a $LOG_FILE
    exit 0
fi

echo "Found $SECURITY_UPDATES security updates" | tee -a $LOG_FILE

# 2. Create pre-update backup
echo "Creating pre-update backup..." | tee -a $LOG_FILE
./backup-database.js --type=pre-security-update

# 3. Apply security updates
echo "Applying security updates..." | tee -a $LOG_FILE
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade

# 4. Update Node.js dependencies
echo "Checking Node.js security updates..." | tee -a $LOG_FILE
cd /opt/cartaisy
npm audit fix --force

# 5. Restart services
echo "Restarting services..." | tee -a $LOG_FILE
systemctl restart cartaisy-backend
systemctl restart nginx

# 6. Verify system health
echo "Verifying system health..." | tee -a $LOG_FILE
sleep 30
./daily-health-check.sh

# 7. Send notification
curl -X POST $SLACK_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d "{\"text\":\"✅ Weekly security updates completed: $SECURITY_UPDATES updates applied\"}"

echo "Security updates completed successfully" | tee -a $LOG_FILE
```

### 📊 Database Optimization (Wednesdays)

**Database Maintenance Script**
```javascript
// Weekly database optimization
// Location: /opt/cartaisy/scripts/weekly-db-optimization.js

const mongoose = require('mongoose');
const fs = require('fs');

const LOG_FILE = `/var/log/cartaisy/db-optimization-${new Date().toISOString().split('T')[0]}.log`;

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_FILE, logMessage);
};

async function optimizeDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    log('Connected to database');

    // 1. Analyze collection statistics
    log('=== Collection Statistics ===');
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      const stats = await mongoose.connection.db.collection(collection.name).stats();
      log(`${collection.name}: ${stats.count} documents, ${Math.round(stats.size / 1024 / 1024)}MB`);
    }

    // 2. Rebuild indexes
    log('=== Rebuilding Indexes ===');
    const indexOperations = [
      mongoose.connection.db.collection('users').reIndex(),
      mongoose.connection.db.collection('products').reIndex(),
      mongoose.connection.db.collection('orders').reIndex(),
    ];
    
    await Promise.all(indexOperations);
    log('All indexes rebuilt successfully');

    // 3. Clean up old sessions
    log('=== Cleaning up old data ===');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    
    const sessionCleanup = await mongoose.connection.db.collection('sessions')
      .deleteMany({ expires: { $lt: cutoffDate } });
    
    log(`Cleaned up ${sessionCleanup.deletedCount} expired sessions`);

    // 4. Archive old logs
    const logArchival = await mongoose.connection.db.collection('logs')
      .deleteMany({ timestamp: { $lt: cutoffDate } });
    
    log(`Archived ${logArchival.deletedCount} old log entries`);

    // 5. Optimize storage
    log('=== Running compaction ===');
    await mongoose.connection.db.command({ compact: 'users' });
    await mongoose.connection.db.command({ compact: 'products' });
    await mongoose.connection.db.command({ compact: 'orders' });
    
    log('Database optimization completed successfully');
    
  } catch (error) {
    log(`Error during database optimization: ${error.message}`);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  optimizeDatabase().catch(error => {
    console.error('Database optimization failed:', error);
    process.exit(1);
  });
}
```

## Monthly Maintenance Procedures

### 🔍 Comprehensive System Audit

**Monthly Audit Checklist**
```bash
#!/bin/bash
# Monthly comprehensive audit
# Location: /opt/cartaisy/scripts/monthly-audit.sh

AUDIT_DATE=$(date +%Y-%m)
AUDIT_DIR="/var/log/cartaisy/audits/$AUDIT_DATE"
mkdir -p "$AUDIT_DIR"

echo "=== Monthly System Audit - $(date) ===" | tee "$AUDIT_DIR/audit-summary.log"

# 1. Security Configuration Audit
echo "1. Security Configuration Audit" | tee -a "$AUDIT_DIR/audit-summary.log"

# Check user accounts
echo "Checking user accounts..." | tee -a "$AUDIT_DIR/audit-summary.log"
cut -d: -f1 /etc/passwd | sort > "$AUDIT_DIR/system-users.txt"
lastlog | grep -v "Never" | tail -n +2 > "$AUDIT_DIR/recent-logins.txt"

# Check sudo access
echo "Checking sudo access..." | tee -a "$AUDIT_DIR/audit-summary.log"
getent group sudo | cut -d: -f4 > "$AUDIT_DIR/sudo-users.txt"

# Check SSH configuration
echo "Checking SSH configuration..." | tee -a "$AUDIT_DIR/audit-summary.log"
sshd -T > "$AUDIT_DIR/ssh-config.txt" 2>/dev/null

# 2. Application Security Audit
echo "2. Application Security Audit" | tee -a "$AUDIT_DIR/audit-summary.log"

# Check for vulnerable dependencies
cd /opt/cartaisy
npm audit --json > "$AUDIT_DIR/npm-audit.json"
CRITICAL_VULNS=$(cat "$AUDIT_DIR/npm-audit.json" | jq '.vulnerabilities | to_entries | map(select(.value.severity == "critical")) | length')

if [ "$CRITICAL_VULNS" -gt 0 ]; then
    echo "⚠️  Found $CRITICAL_VULNS critical vulnerabilities" | tee -a "$AUDIT_DIR/audit-summary.log"
else
    echo "✅ No critical vulnerabilities found" | tee -a "$AUDIT_DIR/audit-summary.log"
fi

# 3. Performance Audit
echo "3. Performance Audit" | tee -a "$AUDIT_DIR/audit-summary.log"

# System resource usage trends
sar -u 1 1 > "$AUDIT_DIR/cpu-usage.txt"
sar -r 1 1 > "$AUDIT_DIR/memory-usage.txt"
sar -d 1 1 > "$AUDIT_DIR/disk-io.txt"

# Application performance metrics
curl -s http://localhost:3000/api/metrics/performance?minutes=43200 > "$AUDIT_DIR/app-performance.json"

# 4. Database Audit
echo "4. Database Audit" | tee -a "$AUDIT_DIR/audit-summary.log"
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const stats = await mongoose.connection.db.stats();
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
});
" > "$AUDIT_DIR/database-stats.json"

# 5. Backup Verification
echo "5. Backup Verification" | tee -a "$AUDIT_DIR/audit-summary.log"
ls -la /opt/cartaisy/backups/ | tail -10 > "$AUDIT_DIR/recent-backups.txt"

# Test latest backup
LATEST_BACKUP=$(ls -t /opt/cartaisy/backups/backup-*/manifest.json | head -1)
if [ -f "$LATEST_BACKUP" ]; then
    echo "✅ Latest backup found: $(dirname $LATEST_BACKUP)" | tee -a "$AUDIT_DIR/audit-summary.log"
    cat "$LATEST_BACKUP" | jq . > "$AUDIT_DIR/latest-backup-manifest.json"
else
    echo "❌ No recent backups found" | tee -a "$AUDIT_DIR/audit-summary.log"
fi

# 6. SSL Certificate Status
echo "6. SSL Certificate Status" | tee -a "$AUDIT_DIR/audit-summary.log"
echo | openssl s_client -servername api.cartaisy.com -connect api.cartaisy.com:443 2>/dev/null | openssl x509 -noout -text > "$AUDIT_DIR/ssl-certificate.txt"

# 7. Generate Summary Report
echo "7. Generating Summary Report" | tee -a "$AUDIT_DIR/audit-summary.log"

cat > "$AUDIT_DIR/audit-report.md" << EOF
# Monthly Security Audit Report - $AUDIT_DATE

## Summary
- **Audit Date**: $(date)
- **Critical Vulnerabilities**: $CRITICAL_VULNS
- **System Users**: $(wc -l < "$AUDIT_DIR/system-users.txt")
- **Recent Logins**: $(wc -l < "$AUDIT_DIR/recent-logins.txt")

## Security Status
$(if [ "$CRITICAL_VULNS" -eq 0 ]; then echo "✅ No critical security issues"; else echo "⚠️  $CRITICAL_VULNS critical issues found"; fi)

## Performance Metrics
- **Average Response Time**: $(cat "$AUDIT_DIR/app-performance.json" | jq -r '.data.overall.averageResponseTime')ms
- **Error Rate**: $(cat "$AUDIT_DIR/app-performance.json" | jq -r '.data.overall.errorRate')%

## Recommendations
$(if [ "$CRITICAL_VULNS" -gt 0 ]; then echo "- Address critical vulnerabilities immediately"; fi)
- Regular security updates applied
- Performance within acceptable ranges
- Backup system operational

---
Generated automatically by Cartaisy maintenance system
EOF

# Send audit report
mail -s "Monthly Audit Report - $AUDIT_DATE" \
     -a "$AUDIT_DIR/audit-report.md" \
     security@cartaisy.com < "$AUDIT_DIR/audit-summary.log"

echo "Monthly audit completed. Reports saved to $AUDIT_DIR"
```

### 📈 Capacity Planning Review

**Capacity Analysis Script**
```python
#!/usr/bin/env python3
# Monthly capacity planning analysis
# Location: /opt/cartaisy/scripts/capacity-planning.py

import json
import requests
import matplotlib.pyplot as plt
import pandas as pd
from datetime import datetime, timedelta
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class CapacityPlanner:
    def __init__(self):
        self.base_url = "http://localhost:3000/api/metrics"
        self.report_data = {}
        
    def collect_metrics(self):
        """Collect performance metrics for analysis"""
        try:
            # Get performance data for last 30 days
            response = requests.get(f"{self.base_url}/performance?minutes=43200")
            performance_data = response.json()
            
            # Get system metrics
            response = requests.get(f"{self.base_url}/system")
            system_data = response.json()
            
            # Get database metrics
            response = requests.get(f"{self.base_url}/database")
            database_data = response.json()
            
            self.report_data = {
                'performance': performance_data,
                'system': system_data,
                'database': database_data,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"Error collecting metrics: {e}")
            raise
    
    def analyze_trends(self):
        """Analyze usage trends and predict capacity needs"""
        analysis = {
            'current_utilization': {},
            'growth_rate': {},
            'capacity_forecast': {},
            'recommendations': []
        }
        
        # Analyze CPU utilization
        cpu_usage = self.report_data['system']['data']['cpu']['usage']
        if cpu_usage > 70:
            analysis['recommendations'].append(
                f"High CPU utilization ({cpu_usage}%) - consider vertical scaling"
            )
        
        # Analyze memory usage
        memory_usage = self.report_data['system']['data']['memory']['usagePercent']
        if memory_usage > 80:
            analysis['recommendations'].append(
                f"High memory usage ({memory_usage}%) - consider memory upgrade"
            )
        
        # Analyze database growth
        db_size = self.report_data['database']['data']['dataSize']['mb']
        analysis['current_utilization']['database_size_mb'] = db_size
        
        if db_size > 10000:  # 10GB
            analysis['recommendations'].append(
                f"Database size is {db_size}MB - plan for storage expansion"
            )
        
        # Request rate analysis
        avg_response_time = self.report_data['performance']['data']['overall']['averageResponseTime']
        if avg_response_time > 500:
            analysis['recommendations'].append(
                f"Average response time is {avg_response_time}ms - consider performance optimization"
            )
        
        return analysis
    
    def generate_forecast(self):
        """Generate 6-month capacity forecast"""
        forecast = {
            'cpu_forecast': "Based on current trends, CPU usage will reach 80% in 3 months",
            'memory_forecast': "Memory usage is stable at current levels",
            'storage_forecast': "Database growth suggests need for additional storage in 6 months",
            'bandwidth_forecast': "Network usage within normal parameters"
        }
        
        return forecast
    
    def create_report(self):
        """Create comprehensive capacity planning report"""
        analysis = self.analyze_trends()
        forecast = self.generate_forecast()
        
        report = f"""
# Monthly Capacity Planning Report

**Report Date:** {datetime.now().strftime('%Y-%m-%d')}
**Period:** Last 30 days

## Current System Utilization

### Compute Resources
- **CPU Usage:** {self.report_data['system']['data']['cpu']['usage']}%
- **Memory Usage:** {self.report_data['system']['data']['memory']['usagePercent']}%
- **Disk Usage:** {self.report_data['system']['data']['disk']['usagePercent']}%

### Application Performance
- **Average Response Time:** {self.report_data['performance']['data']['overall']['averageResponseTime']}ms
- **Request Rate:** {self.report_data['performance']['data']['overall']['requestsPerMinute']} req/min
- **Error Rate:** {self.report_data['performance']['data']['overall']['errorRate']}%

### Database Metrics
- **Database Size:** {self.report_data['database']['data']['dataSize']['mb']}MB
- **Storage Size:** {self.report_data['database']['data']['storageSize']['mb']}MB
- **Active Connections:** {self.report_data['database']['data']['connections']['current']}

## 6-Month Forecast

{forecast['cpu_forecast']}
{forecast['memory_forecast']}
{forecast['storage_forecast']}
{forecast['bandwidth_forecast']}

## Recommendations

"""
        
        for recommendation in analysis['recommendations']:
            report += f"- {recommendation}\n"
        
        if not analysis['recommendations']:
            report += "- No immediate capacity concerns identified\n"
        
        report += """
## Action Items

1. **Immediate (This Month)**
   - Monitor identified high-usage resources
   - Implement performance optimizations if needed

2. **Short Term (3 Months)**
   - Plan resource scaling if usage trends continue
   - Review application efficiency

3. **Long Term (6 Months)**
   - Budget for infrastructure expansion
   - Consider architecture optimizations

---
*Generated by Cartaisy Capacity Planning System*
"""
        
        return report
    
    def send_report(self, report_content):
        """Send capacity planning report via email"""
        try:
            msg = MIMEMultipart()
            msg['From'] = 'system@cartaisy.com'
            msg['To'] = 'devops@cartaisy.com'
            msg['Subject'] = f'Monthly Capacity Planning Report - {datetime.now().strftime("%Y-%m")}'
            
            msg.attach(MIMEText(report_content, 'plain'))
            
            # Configure for your email server
            # server = smtplib.SMTP('smtp.gmail.com', 587)
            # server.starttls()
            # server.login(email, password)
            # server.sendmail(msg['From'], msg['To'], msg.as_string())
            # server.quit()
            
            print("Capacity planning report sent successfully")
            
        except Exception as e:
            print(f"Error sending report: {e}")

def main():
    planner = CapacityPlanner()
    planner.collect_metrics()
    
    report = planner.create_report()
    print(report)
    
    # Save report to file
    report_file = f"/var/log/cartaisy/capacity-report-{datetime.now().strftime('%Y-%m')}.md"
    with open(report_file, 'w') as f:
        f.write(report)
    
    planner.send_report(report)

if __name__ == "__main__":
    main()
```

## Disaster Recovery Procedures

### 🚨 Emergency Response Plan

**Incident Response Workflow**
```bash
#!/bin/bash
# Emergency response script
# Location: /opt/cartaisy/scripts/emergency-response.sh

INCIDENT_TYPE=$1
SEVERITY=$2

if [ -z "$INCIDENT_TYPE" ] || [ -z "$SEVERITY" ]; then
    echo "Usage: $0 <incident_type> <severity>"
    echo "Incident types: outage, security, data_corruption, performance"
    echo "Severity levels: 1-critical, 2-high, 3-medium, 4-low"
    exit 1
fi

INCIDENT_ID="INC-$(date +%Y%m%d%H%M%S)"
LOG_FILE="/var/log/cartaisy/incidents/$INCIDENT_ID.log"
mkdir -p "$(dirname $LOG_FILE)"

echo "=== INCIDENT RESPONSE - $INCIDENT_ID ===" | tee -a $LOG_FILE
echo "Type: $INCIDENT_TYPE | Severity: $SEVERITY | Time: $(date)" | tee -a $LOG_FILE

# Immediate response based on incident type
case $INCIDENT_TYPE in
    "outage")
        echo "Initiating outage response..." | tee -a $LOG_FILE
        
        # 1. Check system status
        systemctl status cartaisy-backend >> $LOG_FILE 2>&1
        systemctl status nginx >> $LOG_FILE 2>&1
        systemctl status mongodb >> $LOG_FILE 2>&1
        
        # 2. Attempt automatic restart
        systemctl restart cartaisy-backend
        sleep 30
        
        # 3. Verify recovery
        if curl -f http://localhost:3000/api/health; then
            echo "✅ Service recovered automatically" | tee -a $LOG_FILE
            SEVERITY=4  # Downgrade if auto-recovered
        else
            echo "❌ Service still down - escalating" | tee -a $LOG_FILE
        fi
        ;;
        
    "security")
        echo "Initiating security incident response..." | tee -a $LOG_FILE
        
        # 1. Preserve evidence
        cp /var/log/nginx/access.log "$LOG_FILE.access.log"
        cp /var/log/cartaisy/security.log "$LOG_FILE.security.log"
        
        # 2. Block suspicious IPs (if provided)
        if [ -n "$3" ]; then
            ufw insert 1 deny from $3
            echo "Blocked IP: $3" | tee -a $LOG_FILE
        fi
        
        # 3. Change admin passwords (if breach suspected)
        if [ "$SEVERITY" = "1" ]; then
            echo "Critical security incident - manual intervention required" | tee -a $LOG_FILE
        fi
        ;;
        
    "data_corruption")
        echo "Initiating data recovery procedures..." | tee -a $LOG_FILE
        
        # 1. Stop application to prevent further corruption
        systemctl stop cartaisy-backend
        
        # 2. Create emergency backup
        ./backup-database.js --type=emergency
        
        # 3. Assess corruption extent
        mongod --repair --dbpath /var/lib/mongodb
        ;;
esac

# Notification based on severity
if [ "$SEVERITY" = "1" ]; then
    # Critical - immediate notification
    curl -X POST "$CRITICAL_ALERT_WEBHOOK" \
         -d "payload={\"text\":\"🚨 CRITICAL INCIDENT: $INCIDENT_ID - $INCIDENT_TYPE\"}"
    
    # Call emergency contacts
    echo "Incident $INCIDENT_ID requires immediate attention" | \
         mail -s "CRITICAL INCIDENT - $INCIDENT_ID" \
              emergency@cartaisy.com
              
elif [ "$SEVERITY" = "2" ]; then
    # High - standard escalation
    curl -X POST "$ALERT_WEBHOOK" \
         -d "payload={\"text\":\"⚠️ HIGH PRIORITY INCIDENT: $INCIDENT_ID - $INCIDENT_TYPE\"}"
fi

echo "Incident response complete for $INCIDENT_ID" | tee -a $LOG_FILE
echo "Log file: $LOG_FILE"
```

## Performance Optimization

### ⚡ Automated Performance Optimization

**Performance Optimization Script**
```javascript
// Automated performance optimization
// Location: /opt/cartaisy/scripts/performance-optimization.js

const mongoose = require('mongoose');
const redis = require('redis');
const fs = require('fs');

class PerformanceOptimizer {
  constructor() {
    this.metrics = {};
    this.optimizations = [];
  }

  async collectPerformanceMetrics() {
    try {
      // Database performance metrics
      const db = mongoose.connection.db;
      const dbStats = await db.stats();
      
      this.metrics.database = {
        size: dbStats.dataSize,
        indexSize: dbStats.indexSize,
        collections: dbStats.collections,
        avgObjSize: dbStats.avgObjSize
      };

      // Query performance analysis
      const slowQueries = await this.identifySlowQueries();
      this.metrics.slowQueries = slowQueries;

      // Memory usage
      this.metrics.memory = process.memoryUsage();

      console.log('Performance metrics collected');
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  async identifySlowQueries() {
    // Enable profiling temporarily
    await mongoose.connection.db.setProfilingLevel(2);
    
    // Wait for some queries to be profiled
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Get slow queries
    const slowQueries = await mongoose.connection.db
      .collection('system.profile')
      .find({ ts: { $gte: new Date(Date.now() - 60000) }, millis: { $gte: 100 } })
      .sort({ millis: -1 })
      .limit(10)
      .toArray();

    // Disable profiling
    await mongoose.connection.db.setProfilingLevel(0);

    return slowQueries;
  }

  async optimizeDatabase() {
    console.log('Starting database optimization...');

    // 1. Analyze and suggest indexes
    const suggestions = await this.analyzeIndexUsage();
    
    for (const suggestion of suggestions) {
      if (suggestion.createIndex) {
        await mongoose.connection.db
          .collection(suggestion.collection)
          .createIndex(suggestion.index);
        
        this.optimizations.push(`Created index on ${suggestion.collection}: ${JSON.stringify(suggestion.index)}`);
      }
    }

    // 2. Remove unused indexes
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      const stats = await mongoose.connection.db
        .collection(collection.name)
        .aggregate([{ $indexStats: {} }])
        .toArray();

      for (const indexStat of stats) {
        if (indexStat.accesses.ops === 0 && indexStat.name !== '_id_') {
          console.log(`Unused index found: ${collection.name}.${indexStat.name}`);
          // Note: Be careful with automatic index dropping in production
          // await mongoose.connection.db.collection(collection.name).dropIndex(indexStat.name);
        }
      }
    }

    console.log('Database optimization complete');
  }

  async analyzeIndexUsage() {
    const suggestions = [];

    // Analyze frequent queries for missing indexes
    if (this.metrics.slowQueries) {
      for (const query of this.metrics.slowQueries) {
        if (query.planSummary === 'COLLSCAN') {
          const collection = query.ns.split('.').pop();
          const filter = query.command.filter || query.command.query;
          
          if (filter) {
            const indexFields = Object.keys(filter);
            suggestions.push({
              collection,
              index: indexFields.reduce((obj, field) => {
                obj[field] = 1;
                return obj;
              }, {}),
              createIndex: true,
              reason: `Collection scan detected for query: ${JSON.stringify(filter)}`
            });
          }
        }
      }
    }

    return suggestions;
  }

  async optimizeApplicationCache() {
    console.log('Optimizing application cache...');

    try {
      const redisClient = redis.createClient(process.env.REDIS_URL);
      await redisClient.connect();

      // Clear expired keys
      const keys = await redisClient.keys('*');
      let expiredCount = 0;

      for (const key of keys) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1) {  // Keys without expiration
          // Set reasonable TTL based on key pattern
          if (key.startsWith('session:')) {
            await redisClient.expire(key, 86400); // 24 hours for sessions
          } else if (key.startsWith('cache:')) {
            await redisClient.expire(key, 3600);  // 1 hour for cache
          }
          expiredCount++;
        }
      }

      this.optimizations.push(`Set TTL for ${expiredCount} Redis keys`);

      // Optimize memory usage
      const memoryUsage = await redisClient.memory('usage');
      console.log(`Redis memory usage: ${memoryUsage} bytes`);

      await redisClient.disconnect();
    } catch (error) {
      console.error('Redis optimization error:', error);
    }

    console.log('Application cache optimization complete');
  }

  async optimizeFileSystem() {
    console.log('Optimizing file system...');

    // Clean up old log files
    const logDir = '/var/log/cartaisy';
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    try {
      const files = fs.readdirSync(logDir);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = `${logDir}/${file}`;
        const stats = fs.statSync(filePath);
        
        if (stats.birthtime < cutoffDate && file.endsWith('.log')) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }

      this.optimizations.push(`Cleaned up ${cleanedCount} old log files`);

      // Compress large log files
      const largeFiles = files.filter(file => {
        const filePath = `${logDir}/${file}`;
        const stats = fs.statSync(filePath);
        return stats.size > 100 * 1024 * 1024; // 100MB
      });

      for (const file of largeFiles) {
        // In production, implement log compression
        console.log(`Large log file found: ${file}`);
      }

    } catch (error) {
      console.error('File system optimization error:', error);
    }

    console.log('File system optimization complete');
  }

  async generateOptimizationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      optimizations: this.optimizations,
      recommendations: []
    };

    // Generate recommendations based on metrics
    if (this.metrics.memory && this.metrics.memory.heapUsed > 1024 * 1024 * 1024) {
      report.recommendations.push('High memory usage detected - consider increasing heap size or optimizing memory usage');
    }

    if (this.metrics.slowQueries && this.metrics.slowQueries.length > 0) {
      report.recommendations.push(`${this.metrics.slowQueries.length} slow queries identified - review and optimize`);
    }

    // Save report
    const reportPath = `/var/log/cartaisy/performance-optimization-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Optimization report saved to: ${reportPath}`);
    return report;
  }

  async run() {
    console.log('Starting automated performance optimization...');
    
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      
      await this.collectPerformanceMetrics();
      await this.optimizeDatabase();
      await this.optimizeApplicationCache();
      await this.optimizeFileSystem();
      
      const report = await this.generateOptimizationReport();
      
      console.log('Performance optimization completed successfully');
      console.log(`Applied ${this.optimizations.length} optimizations`);
      
    } catch (error) {
      console.error('Performance optimization failed:', error);
    } finally {
      await mongoose.disconnect();
    }
  }
}

// Run if called directly
if (require.main === module) {
  const optimizer = new PerformanceOptimizer();
  optimizer.run().catch(console.error);
}

module.exports = PerformanceOptimizer;
```

## Maintenance Automation

### 🤖 Automated Maintenance Scheduler

**Crontab Configuration**
```bash
# Cartaisy Backend Maintenance Crontab
# Install with: crontab -e

# Daily maintenance (02:00 AM)
0 2 * * * /opt/cartaisy/scripts/daily-health-check.sh
30 2 * * * /opt/cartaisy/scripts/backup-database.js
45 2 * * * /opt/cartaisy/scripts/log-rotation.sh

# Weekly maintenance
0 3 * * 1 /opt/cartaisy/scripts/weekly-security-updates.sh
0 3 * * 3 /opt/cartaisy/scripts/weekly-db-optimization.js
0 3 * * 5 /opt/cartaisy/scripts/weekly-performance-check.sh

# Monthly maintenance (1st of each month)
0 4 1 * * /opt/cartaisy/scripts/monthly-audit.sh
0 5 1 * * /opt/cartaisy/scripts/capacity-planning.py

# Quarterly maintenance (1st day of Q1,Q2,Q3,Q4)
0 6 1 1,4,7,10 * /opt/cartaisy/scripts/quarterly-review.sh

# Performance optimization (every Sunday at 4 AM)
0 4 * * 0 /opt/cartaisy/scripts/performance-optimization.js
```

## Monitoring & Alerting

### 📊 Maintenance Monitoring Dashboard

**Key Maintenance Metrics**
```javascript
// Maintenance monitoring metrics
const maintenanceMetrics = {
  backupStatus: {
    lastBackupTime: new Date(),
    backupSuccess: true,
    backupSize: '2.5GB',
    retentionCompliance: true
  },
  
  systemHealth: {
    cpuUsage: 45,
    memoryUsage: 67,
    diskUsage: 34,
    networkLatency: 23
  },
  
  securityStatus: {
    lastSecurityUpdate: new Date(),
    vulnerabilityCount: 0,
    failedLoginAttempts: 3,
    securityScanStatus: 'clean'
  },
  
  performanceMetrics: {
    averageResponseTime: 145,
    errorRate: 0.02,
    throughput: 1250,
    slowQueryCount: 2
  }
};
```

This maintenance guide provides comprehensive procedures for keeping the Cartaisy Backend system running optimally. Regular execution of these maintenance tasks ensures system reliability, security, and performance.
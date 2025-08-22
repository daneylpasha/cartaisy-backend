#!/usr/bin/env node

/**
 * Database Backup Script
 * 
 * Comprehensive MongoDB backup solution with compression,
 * encryption, and cloud storage support.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

// Load environment variables
require('dotenv').config();

// Configuration
const config = {
  mongoUri: process.env.MONGODB_URI,
  backupDir: process.env.BACKUP_DIR || './backups',
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 7,
  compression: process.env.BACKUP_COMPRESSION !== 'false',
  encryption: process.env.BACKUP_ENCRYPTION === 'true',
  encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
  s3Bucket: process.env.BACKUP_S3_BUCKET,
  s3Region: process.env.BACKUP_S3_REGION || 'us-east-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  slackWebhook: process.env.BACKUP_SLACK_WEBHOOK,
  emailNotification: process.env.BACKUP_EMAIL_NOTIFICATION
};

// ANSI colors
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

class DatabaseBackup {
  constructor() {
    this.startTime = Date.now();
    this.backupId = this.generateBackupId();
    this.backupPath = null;
    this.stats = {
      collections: 0,
      documents: 0,
      size: 0,
      duration: 0
    };
  }

  /**
   * Main backup execution
   */
  async execute() {
    console.log(`${colors.cyan}${colors.bright}🔄 Starting MongoDB Backup${colors.reset}`);
    console.log(`Backup ID: ${this.backupId}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    try {
      // Validate configuration
      await this.validateConfig();

      // Create backup directory
      await this.createBackupDirectory();

      // Perform database backup
      await this.performBackup();

      // Compress backup if enabled
      if (config.compression) {
        await this.compressBackup();
      }

      // Encrypt backup if enabled
      if (config.encryption) {
        await this.encryptBackup();
      }

      // Upload to cloud storage if configured
      if (config.s3Bucket) {
        await this.uploadToS3();
      }

      // Clean up old backups
      await this.cleanupOldBackups();

      // Generate backup manifest
      await this.generateManifest();

      // Calculate final statistics
      this.calculateStats();

      // Send notifications
      await this.sendNotifications(true);

      console.log(`${colors.green}${colors.bright}✅ Backup completed successfully!${colors.reset}`);
      this.printSummary();

    } catch (error) {
      console.error(`${colors.red}${colors.bright}❌ Backup failed:${colors.reset}`, error.message);
      await this.sendNotifications(false, error);
      process.exit(1);
    }
  }

  /**
   * Validate backup configuration
   */
  async validateConfig() {
    console.log(`${colors.blue}🔍 Validating configuration...${colors.reset}`);

    if (!config.mongoUri) {
      throw new Error('MONGODB_URI is required');
    }

    // Check if mongodump is available
    try {
      execSync('mongodump --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('mongodump is not installed or not in PATH');
    }

    // Validate encryption settings
    if (config.encryption && !config.encryptionKey) {
      throw new Error('BACKUP_ENCRYPTION_KEY is required when encryption is enabled');
    }

    // Validate AWS settings if S3 upload is configured
    if (config.s3Bucket) {
      if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
        throw new Error('AWS credentials are required for S3 upload');
      }
    }

    console.log(`   ✅ Configuration validated`);
  }

  /**
   * Create backup directory structure
   */
  async createBackupDirectory() {
    console.log(`${colors.blue}📁 Creating backup directory...${colors.reset}`);

    // Create main backup directory
    if (!fs.existsSync(config.backupDir)) {
      fs.mkdirSync(config.backupDir, { recursive: true });
    }

    // Create backup-specific directory
    this.backupPath = path.join(config.backupDir, this.backupId);
    fs.mkdirSync(this.backupPath, { recursive: true });

    console.log(`   ✅ Backup directory created: ${this.backupPath}`);
  }

  /**
   * Perform MongoDB backup using mongodump
   */
  async performBackup() {
    console.log(`${colors.blue}💾 Performing database backup...${colors.reset}`);

    const dumpPath = path.join(this.backupPath, 'dump');
    const command = [
      'mongodump',
      '--uri', `"${config.mongoUri}"`,
      '--out', dumpPath,
      '--quiet'
    ];

    try {
      const startTime = Date.now();
      execSync(command.join(' '), { stdio: 'inherit' });
      const duration = Date.now() - startTime;

      console.log(`   ✅ Database backup completed in ${duration}ms`);

      // Get backup statistics
      await this.collectBackupStats(dumpPath);

    } catch (error) {
      throw new Error(`mongodump failed: ${error.message}`);
    }
  }

  /**
   * Collect backup statistics
   */
  async collectBackupStats(dumpPath) {
    try {
      const dbDirs = fs.readdirSync(dumpPath);
      
      for (const dbDir of dbDirs) {
        const dbPath = path.join(dumpPath, dbDir);
        if (fs.statSync(dbPath).isDirectory()) {
          const files = fs.readdirSync(dbPath);
          const bsonFiles = files.filter(f => f.endsWith('.bson'));
          
          this.stats.collections += bsonFiles.length;
          
          // Calculate total size
          for (const file of files) {
            const filePath = path.join(dbPath, file);
            const stats = fs.statSync(filePath);
            this.stats.size += stats.size;
          }
        }
      }

      console.log(`   📊 Collections: ${this.stats.collections}, Size: ${this.formatBytes(this.stats.size)}`);
    } catch (error) {
      console.warn(`   ⚠️  Could not collect backup statistics: ${error.message}`);
    }
  }

  /**
   * Compress backup using tar + gzip
   */
  async compressBackup() {
    console.log(`${colors.blue}🗜️  Compressing backup...${colors.reset}`);

    const dumpPath = path.join(this.backupPath, 'dump');
    const archivePath = path.join(this.backupPath, `${this.backupId}.tar.gz`);

    try {
      const command = `tar -czf "${archivePath}" -C "${this.backupPath}" dump`;
      execSync(command);

      // Remove uncompressed dump directory
      execSync(`rm -rf "${dumpPath}"`);

      const archiveStats = fs.statSync(archivePath);
      const compressionRatio = ((this.stats.size - archiveStats.size) / this.stats.size * 100).toFixed(1);

      console.log(`   ✅ Compression completed`);
      console.log(`   📊 Original: ${this.formatBytes(this.stats.size)}, Compressed: ${this.formatBytes(archiveStats.size)} (${compressionRatio}% reduction)`);

      this.stats.size = archiveStats.size;
    } catch (error) {
      throw new Error(`Compression failed: ${error.message}`);
    }
  }

  /**
   * Encrypt backup using AES-256-GCM
   */
  async encryptBackup() {
    console.log(`${colors.blue}🔐 Encrypting backup...${colors.reset}`);

    const inputFile = config.compression 
      ? path.join(this.backupPath, `${this.backupId}.tar.gz`)
      : path.join(this.backupPath, 'dump');
    
    const outputFile = `${inputFile}.encrypted`;

    try {
      const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', key);

      const input = fs.createReadStream(inputFile);
      const output = fs.createWriteStream(outputFile);

      // Write IV to the beginning of the encrypted file
      output.write(iv);

      input.pipe(cipher).pipe(output);

      await new Promise((resolve, reject) => {
        output.on('finish', resolve);
        output.on('error', reject);
      });

      // Get authentication tag and append to file
      const tag = cipher.getAuthTag();
      fs.appendFileSync(outputFile, tag);

      // Remove unencrypted file
      fs.unlinkSync(inputFile);

      console.log(`   ✅ Encryption completed`);
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Upload backup to AWS S3
   */
  async uploadToS3() {
    console.log(`${colors.blue}☁️  Uploading to S3...${colors.reset}`);

    try {
      // Check if AWS CLI is available
      execSync('aws --version', { stdio: 'ignore' });

      const backupFile = this.getBackupFileName();
      const localPath = path.join(this.backupPath, backupFile);
      const s3Key = `mongodb-backups/${this.backupId}/${backupFile}`;

      const command = [
        'aws', 's3', 'cp',
        `"${localPath}"`,
        `s3://${config.s3Bucket}/${s3Key}`,
        '--region', config.s3Region,
        '--storage-class', 'STANDARD_IA'
      ];

      // Set AWS credentials as environment variables
      const env = {
        ...process.env,
        AWS_ACCESS_KEY_ID: config.awsAccessKeyId,
        AWS_SECRET_ACCESS_KEY: config.awsSecretAccessKey
      };

      execSync(command.join(' '), { env, stdio: 'inherit' });

      console.log(`   ✅ Upload completed: s3://${config.s3Bucket}/${s3Key}`);
    } catch (error) {
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups() {
    console.log(`${colors.blue}🧹 Cleaning up old backups...${colors.reset}`);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

      const backupDirs = fs.readdirSync(config.backupDir);
      let deletedCount = 0;
      let freedSpace = 0;

      for (const dir of backupDirs) {
        const dirPath = path.join(config.backupDir, dir);
        const stats = fs.statSync(dirPath);

        if (stats.isDirectory() && stats.birthtime < cutoffDate) {
          const dirSize = this.getDirectorySize(dirPath);
          execSync(`rm -rf "${dirPath}"`);
          deletedCount++;
          freedSpace += dirSize;
        }
      }

      if (deletedCount > 0) {
        console.log(`   ✅ Deleted ${deletedCount} old backups, freed ${this.formatBytes(freedSpace)}`);
      } else {
        console.log(`   ✅ No old backups to clean up`);
      }
    } catch (error) {
      console.warn(`   ⚠️  Cleanup warning: ${error.message}`);
    }
  }

  /**
   * Generate backup manifest with metadata
   */
  async generateManifest() {
    console.log(`${colors.blue}📋 Generating backup manifest...${colors.reset}`);

    const manifest = {
      backupId: this.backupId,
      timestamp: new Date().toISOString(),
      mongoUri: config.mongoUri.replace(/\/\/.*@/, '//*****@'), // Hide credentials
      duration: Date.now() - this.startTime,
      stats: this.stats,
      compression: config.compression,
      encryption: config.encryption,
      s3Upload: !!config.s3Bucket,
      s3Bucket: config.s3Bucket,
      files: this.getBackupFiles(),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform
    };

    const manifestPath = path.join(this.backupPath, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`   ✅ Manifest generated: ${manifestPath}`);
  }

  /**
   * Calculate final statistics
   */
  calculateStats() {
    this.stats.duration = Date.now() - this.startTime;
  }

  /**
   * Send backup notifications
   */
  async sendNotifications(success, error = null) {
    try {
      const message = success 
        ? `✅ MongoDB backup completed successfully\nBackup ID: ${this.backupId}\nSize: ${this.formatBytes(this.stats.size)}\nDuration: ${this.formatDuration(this.stats.duration)}`
        : `❌ MongoDB backup failed\nBackup ID: ${this.backupId}\nError: ${error?.message || 'Unknown error'}`;

      // Slack notification
      if (config.slackWebhook) {
        await this.sendSlackNotification(message, success);
      }

      // Email notification
      if (config.emailNotification) {
        await this.sendEmailNotification(message, success);
      }
    } catch (notificationError) {
      console.warn(`   ⚠️  Notification failed: ${notificationError.message}`);
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(message, success) {
    const payload = {
      text: message,
      color: success ? 'good' : 'danger',
      fields: [
        { title: 'Environment', value: process.env.NODE_ENV || 'development', short: true },
        { title: 'Timestamp', value: new Date().toISOString(), short: true }
      ]
    };

    // In a real implementation, you would send HTTP request to Slack webhook
    console.log(`   📱 Slack notification: ${success ? 'Success' : 'Failed'}`);
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(message, success) {
    // In a real implementation, you would send email notification
    console.log(`   📧 Email notification: ${success ? 'Success' : 'Failed'}`);
  }

  /**
   * Print backup summary
   */
  printSummary() {
    console.log(`\n${colors.cyan}${colors.bright}📊 Backup Summary${colors.reset}`);
    console.log('═'.repeat(50));
    console.log(`Backup ID:      ${this.backupId}`);
    console.log(`Collections:    ${this.stats.collections}`);
    console.log(`Total Size:     ${this.formatBytes(this.stats.size)}`);
    console.log(`Duration:       ${this.formatDuration(this.stats.duration)}`);
    console.log(`Compression:    ${config.compression ? 'Enabled' : 'Disabled'}`);
    console.log(`Encryption:     ${config.encryption ? 'Enabled' : 'Disabled'}`);
    console.log(`S3 Upload:      ${config.s3Bucket ? 'Enabled' : 'Disabled'}`);
    console.log(`Backup Path:    ${this.backupPath}`);
    console.log('═'.repeat(50));
  }

  /**
   * Helper methods
   */

  generateBackupId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `backup-${timestamp}-${random}`;
  }

  getBackupFileName() {
    let fileName = this.backupId;
    
    if (config.compression) {
      fileName += '.tar.gz';
    }
    
    if (config.encryption) {
      fileName += '.encrypted';
    }
    
    return fileName;
  }

  getBackupFiles() {
    try {
      return fs.readdirSync(this.backupPath);
    } catch (error) {
      return [];
    }
  }

  getDirectorySize(dirPath) {
    let totalSize = 0;
    
    function calculateSize(currentPath) {
      const stats = fs.statSync(currentPath);
      
      if (stats.isDirectory()) {
        const files = fs.readdirSync(currentPath);
        for (const file of files) {
          calculateSize(path.join(currentPath, file));
        }
      } else {
        totalSize += stats.size;
      }
    }
    
    calculateSize(dirPath);
    return totalSize;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Execute backup if called directly
if (require.main === module) {
  const backup = new DatabaseBackup();
  backup.execute().catch(error => {
    console.error('Backup failed:', error);
    process.exit(1);
  });
}

module.exports = DatabaseBackup;
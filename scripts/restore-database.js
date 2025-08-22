#!/usr/bin/env node

/**
 * Database Restore Script
 * 
 * Comprehensive MongoDB restore solution with support for
 * encrypted backups, S3 downloads, and selective restoration.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

// Load environment variables
require('dotenv').config();

// Configuration
const config = {
  mongoUri: process.env.MONGODB_URI,
  backupDir: process.env.BACKUP_DIR || './backups',
  encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
  s3Bucket: process.env.BACKUP_S3_BUCKET,
  s3Region: process.env.BACKUP_S3_REGION || 'us-east-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
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

class DatabaseRestore {
  constructor() {
    this.startTime = Date.now();
    this.restorePath = null;
    this.stats = {
      collections: 0,
      documents: 0,
      size: 0,
      duration: 0
    };
  }

  /**
   * Main restore execution
   */
  async execute() {
    console.log(`${colors.cyan}${colors.bright}🔄 Starting MongoDB Restore${colors.reset}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    try {
      // Parse command line arguments
      const options = this.parseArguments();

      // Validate configuration
      await this.validateConfig();

      // List available backups or use specified backup
      const backupId = options.backupId || await this.selectBackup();

      // Download from S3 if needed
      if (options.fromS3 || (!fs.existsSync(path.join(config.backupDir, backupId)) && config.s3Bucket)) {
        await this.downloadFromS3(backupId);
      }

      // Prepare backup for restoration
      await this.prepareBackup(backupId);

      // Confirm restore operation
      if (!options.force) {
        await this.confirmRestore(backupId);
      }

      // Perform database restore
      await this.performRestore(backupId, options);

      // Calculate final statistics
      this.calculateStats();

      console.log(`${colors.green}${colors.bright}✅ Restore completed successfully!${colors.reset}`);
      this.printSummary();

    } catch (error) {
      console.error(`${colors.red}${colors.bright}❌ Restore failed:${colors.reset}`, error.message);
      process.exit(1);
    }
  }

  /**
   * Parse command line arguments
   */
  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      backupId: null,
      fromS3: false,
      force: false,
      drop: false,
      database: null,
      collection: null
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--backup-id':
          options.backupId = args[++i];
          break;
        case '--from-s3':
          options.fromS3 = true;
          break;
        case '--force':
          options.force = true;
          break;
        case '--drop':
          options.drop = true;
          break;
        case '--database':
          options.database = args[++i];
          break;
        case '--collection':
          options.collection = args[++i];
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
        default:
          if (!options.backupId) {
            options.backupId = args[i];
          }
      }
    }

    return options;
  }

  /**
   * Print help information
   */
  printHelp() {
    console.log(`${colors.cyan}${colors.bright}MongoDB Restore Script${colors.reset}\n`);
    console.log('Usage: node restore-database.js [options] [backup-id]\n');
    console.log('Options:');
    console.log('  --backup-id <id>     Specific backup ID to restore');
    console.log('  --from-s3            Download backup from S3');
    console.log('  --force              Skip confirmation prompts');
    console.log('  --drop               Drop existing database before restore');
    console.log('  --database <name>    Restore specific database only');
    console.log('  --collection <name>  Restore specific collection only');
    console.log('  --help               Show this help message\n');
    console.log('Examples:');
    console.log('  node restore-database.js');
    console.log('  node restore-database.js backup-2023-10-01T10-00-00-abc123');
    console.log('  node restore-database.js --from-s3 --backup-id backup-2023-10-01T10-00-00-abc123');
    console.log('  node restore-database.js --database mystore --drop');
  }

  /**
   * Validate restore configuration
   */
  async validateConfig() {
    console.log(`${colors.blue}🔍 Validating configuration...${colors.reset}`);

    if (!config.mongoUri) {
      throw new Error('MONGODB_URI is required');
    }

    // Check if mongorestore is available
    try {
      execSync('mongorestore --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('mongorestore is not installed or not in PATH');
    }

    console.log(`   ✅ Configuration validated`);
  }

  /**
   * List available backups and let user select
   */
  async selectBackup() {
    console.log(`${colors.blue}📋 Available backups:${colors.reset}\n`);

    const backups = await this.listBackups();
    
    if (backups.length === 0) {
      throw new Error('No backups found');
    }

    // Display backup list
    backups.forEach((backup, index) => {
      console.log(`${index + 1}. ${backup.id}`);
      console.log(`   Date: ${backup.timestamp}`);
      console.log(`   Size: ${backup.size}`);
      console.log(`   Location: ${backup.location}`);
      console.log('');
    });

    // Get user selection
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('Select backup number (or enter backup ID): ', resolve);
    });

    rl.close();

    // Parse selection
    const selection = parseInt(answer);
    if (!isNaN(selection) && selection >= 1 && selection <= backups.length) {
      return backups[selection - 1].id;
    } else {
      // Assume it's a backup ID
      return answer.trim();
    }
  }

  /**
   * List available backups from local and S3
   */
  async listBackups() {
    const backups = [];

    // Local backups
    if (fs.existsSync(config.backupDir)) {
      const localDirs = fs.readdirSync(config.backupDir);
      
      for (const dir of localDirs) {
        const dirPath = path.join(config.backupDir, dir);
        const manifestPath = path.join(dirPath, 'manifest.json');
        
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            backups.push({
              id: manifest.backupId,
              timestamp: manifest.timestamp,
              size: this.formatBytes(manifest.stats.size),
              location: 'local'
            });
          } catch (error) {
            // Skip invalid manifests
          }
        }
      }
    }

    // S3 backups (if configured)
    if (config.s3Bucket) {
      try {
        const s3Backups = await this.listS3Backups();
        backups.push(...s3Backups);
      } catch (error) {
        console.warn(`   ⚠️  Could not list S3 backups: ${error.message}`);
      }
    }

    // Sort by timestamp (newest first)
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * List backups from S3
   */
  async listS3Backups() {
    try {
      execSync('aws --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('AWS CLI is not installed');
    }

    const command = [
      'aws', 's3api', 'list-objects-v2',
      '--bucket', config.s3Bucket,
      '--prefix', 'mongodb-backups/',
      '--query', 'Contents[?ends_with(Key, `manifest.json`)].{Key:Key,Size:Size,LastModified:LastModified}',
      '--output', 'json'
    ];

    const env = {
      ...process.env,
      AWS_ACCESS_KEY_ID: config.awsAccessKeyId,
      AWS_SECRET_ACCESS_KEY: config.awsSecretAccessKey
    };

    try {
      const output = execSync(command.join(' '), { env, encoding: 'utf8' });
      const objects = JSON.parse(output);
      
      const backups = [];
      for (const obj of objects) {
        const backupId = obj.Key.split('/')[1]; // Extract backup ID from path
        backups.push({
          id: backupId,
          timestamp: obj.LastModified,
          size: this.formatBytes(obj.Size),
          location: 's3'
        });
      }
      
      return backups;
    } catch (error) {
      throw new Error(`Failed to list S3 backups: ${error.message}`);
    }
  }

  /**
   * Download backup from S3
   */
  async downloadFromS3(backupId) {
    console.log(`${colors.blue}☁️  Downloading backup from S3...${colors.reset}`);

    const localBackupPath = path.join(config.backupDir, backupId);
    
    // Create local directory
    if (!fs.existsSync(localBackupPath)) {
      fs.mkdirSync(localBackupPath, { recursive: true });
    }

    const s3Prefix = `mongodb-backups/${backupId}/`;
    
    const command = [
      'aws', 's3', 'sync',
      `s3://${config.s3Bucket}/${s3Prefix}`,
      `"${localBackupPath}"`,
      '--region', config.s3Region
    ];

    const env = {
      ...process.env,
      AWS_ACCESS_KEY_ID: config.awsAccessKeyId,
      AWS_SECRET_ACCESS_KEY: config.awsSecretAccessKey
    };

    try {
      execSync(command.join(' '), { env, stdio: 'inherit' });
      console.log(`   ✅ Download completed`);
    } catch (error) {
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  /**
   * Prepare backup for restoration (decrypt, decompress)
   */
  async prepareBackup(backupId) {
    console.log(`${colors.blue}🔧 Preparing backup for restoration...${colors.reset}`);

    const backupPath = path.join(config.backupDir, backupId);
    this.restorePath = backupPath;

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
    }

    // Check manifest
    const manifestPath = path.join(backupPath, 'manifest.json');
    let manifest = {};
    
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log(`   📋 Backup Info: ${manifest.stats.collections} collections, ${this.formatBytes(manifest.stats.size)}`);
    }

    // Find backup file
    const files = fs.readdirSync(backupPath);
    let backupFile = null;

    // Look for encrypted file first
    const encryptedFile = files.find(f => f.endsWith('.encrypted'));
    if (encryptedFile) {
      console.log(`   🔐 Decrypting backup...`);
      await this.decryptBackup(path.join(backupPath, encryptedFile));
      backupFile = encryptedFile.replace('.encrypted', '');
    } else {
      // Look for compressed file
      backupFile = files.find(f => f.endsWith('.tar.gz'));
    }

    // Decompress if needed
    if (backupFile && backupFile.endsWith('.tar.gz')) {
      console.log(`   🗜️  Decompressing backup...`);
      await this.decompressBackup(path.join(backupPath, backupFile));
    }

    // Verify dump directory exists
    const dumpPath = path.join(backupPath, 'dump');
    if (!fs.existsSync(dumpPath)) {
      throw new Error('Dump directory not found in backup');
    }

    console.log(`   ✅ Backup prepared for restoration`);
  }

  /**
   * Decrypt backup file
   */
  async decryptBackup(encryptedFilePath) {
    if (!config.encryptionKey) {
      throw new Error('BACKUP_ENCRYPTION_KEY is required to decrypt backup');
    }

    const outputPath = encryptedFilePath.replace('.encrypted', '');
    
    try {
      const encryptedData = fs.readFileSync(encryptedFilePath);
      
      // Extract IV (first 16 bytes)
      const iv = encryptedData.slice(0, 16);
      
      // Extract auth tag (last 16 bytes)
      const tag = encryptedData.slice(-16);
      
      // Extract encrypted content
      const encrypted = encryptedData.slice(16, -16);
      
      const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipher('aes-256-gcm', key);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      fs.writeFileSync(outputPath, decrypted);
      
      // Remove encrypted file
      fs.unlinkSync(encryptedFilePath);
      
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Decompress backup file
   */
  async decompressBackup(archivePath) {
    const backupDir = path.dirname(archivePath);
    
    try {
      const command = `tar -xzf "${archivePath}" -C "${backupDir}"`;
      execSync(command);
      
      // Remove compressed file
      fs.unlinkSync(archivePath);
      
    } catch (error) {
      throw new Error(`Decompression failed: ${error.message}`);
    }
  }

  /**
   * Confirm restore operation
   */
  async confirmRestore(backupId) {
    console.log(`${colors.yellow}${colors.bright}⚠️  RESTORE CONFIRMATION${colors.reset}`);
    console.log(`You are about to restore backup: ${colors.cyan}${backupId}${colors.reset}`);
    console.log(`Target database: ${colors.cyan}${config.mongoUri.replace(/\/\/.*@/, '//*****@')}${colors.reset}`);
    console.log(`${colors.red}This operation will modify your database!${colors.reset}\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('Are you sure you want to continue? (yes/no): ', resolve);
    });

    rl.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Restore cancelled by user');
      process.exit(0);
    }
  }

  /**
   * Perform MongoDB restore using mongorestore
   */
  async performRestore(backupId, options) {
    console.log(`${colors.blue}💾 Performing database restore...${colors.reset}`);

    const dumpPath = path.join(this.restorePath, 'dump');
    const command = ['mongorestore'];

    // Add URI
    command.push('--uri', `"${config.mongoUri}"`);

    // Add options
    if (options.drop) {
      command.push('--drop');
      console.log(`   ⚠️  Existing data will be dropped`);
    }

    if (options.database) {
      command.push('--db', options.database);
      console.log(`   📊 Restoring database: ${options.database}`);
    }

    if (options.collection) {
      command.push('--collection', options.collection);
      console.log(`   📋 Restoring collection: ${options.collection}`);
    }

    // Add dump path
    command.push(dumpPath);

    // Add verbose output
    command.push('--verbose');

    try {
      const startTime = Date.now();
      execSync(command.join(' '), { stdio: 'inherit' });
      const duration = Date.now() - startTime;

      console.log(`   ✅ Database restore completed in ${duration}ms`);

      // Collect restore statistics
      await this.collectRestoreStats(dumpPath);

    } catch (error) {
      throw new Error(`mongorestore failed: ${error.message}`);
    }
  }

  /**
   * Collect restore statistics
   */
  async collectRestoreStats(dumpPath) {
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

      console.log(`   📊 Restored: ${this.stats.collections} collections, ${this.formatBytes(this.stats.size)}`);
    } catch (error) {
      console.warn(`   ⚠️  Could not collect restore statistics: ${error.message}`);
    }
  }

  /**
   * Calculate final statistics
   */
  calculateStats() {
    this.stats.duration = Date.now() - this.startTime;
  }

  /**
   * Print restore summary
   */
  printSummary() {
    console.log(`\n${colors.cyan}${colors.bright}📊 Restore Summary${colors.reset}`);
    console.log('═'.repeat(50));
    console.log(`Collections:    ${this.stats.collections}`);
    console.log(`Total Size:     ${this.formatBytes(this.stats.size)}`);
    console.log(`Duration:       ${this.formatDuration(this.stats.duration)}`);
    console.log(`Source Path:    ${this.restorePath}`);
    console.log('═'.repeat(50));
  }

  /**
   * Helper methods
   */

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

// Execute restore if called directly
if (require.main === module) {
  const restore = new DatabaseRestore();
  restore.execute().catch(error => {
    console.error('Restore failed:', error);
    process.exit(1);
  });
}

module.exports = DatabaseRestore;
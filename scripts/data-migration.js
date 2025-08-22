#!/usr/bin/env node

/**
 * Data Migration Script
 * 
 * Comprehensive data migration tool for schema updates,
 * data transformations, and version migrations.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

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

class DataMigration {
  constructor() {
    this.migrationPath = path.join(__dirname, '..', 'migrations');
    this.appliedMigrations = [];
    this.pendingMigrations = [];
    this.stats = {
      migrated: 0,
      skipped: 0,
      failed: 0,
      duration: 0
    };
  }

  /**
   * Main migration execution
   */
  async execute() {
    console.log(`${colors.cyan}${colors.bright}🔄 Starting Data Migration${colors.reset}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    const startTime = Date.now();

    try {
      // Parse command line arguments
      const options = this.parseArguments();

      // Connect to database
      await this.connectDatabase();

      // Initialize migration tracking
      await this.initializeMigrationTracking();

      // Discover migrations
      await this.discoverMigrations();

      // Show migration status
      await this.showMigrationStatus();

      // Execute migrations based on command
      switch (options.command) {
        case 'up':
          await this.runMigrations(options.target);
          break;
        case 'down':
          await this.rollbackMigrations(options.target);
          break;
        case 'status':
          // Already shown above
          break;
        case 'create':
          await this.createMigration(options.name);
          break;
        default:
          this.printHelp();
          return;
      }

      this.stats.duration = Date.now() - startTime;
      this.printSummary();

    } catch (error) {
      console.error(`${colors.red}${colors.bright}❌ Migration failed:${colors.reset}`, error.message);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
    }
  }

  /**
   * Parse command line arguments
   */
  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      command: 'status',
      target: null,
      name: null,
      force: false
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case 'up':
        case 'down':
        case 'status':
        case 'create':
          options.command = args[i];
          break;
        case '--target':
          options.target = args[++i];
          break;
        case '--name':
          options.name = args[++i];
          break;
        case '--force':
          options.force = true;
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
        default:
          if (!options.target && !options.name) {
            if (options.command === 'create') {
              options.name = args[i];
            } else {
              options.target = args[i];
            }
          }
      }
    }

    return options;
  }

  /**
   * Print help information
   */
  printHelp() {
    console.log(`${colors.cyan}${colors.bright}Data Migration Tool${colors.reset}\n`);
    console.log('Usage: node data-migration.js <command> [options]\n');
    console.log('Commands:');
    console.log('  up [target]      Run pending migrations (optionally up to target)');
    console.log('  down [target]    Rollback migrations (optionally down to target)');
    console.log('  status           Show migration status');
    console.log('  create <name>    Create a new migration file\n');
    console.log('Options:');
    console.log('  --target <name>  Target migration name');
    console.log('  --name <name>    Migration name for create command');
    console.log('  --force          Force execution without confirmation');
    console.log('  --help           Show this help message\n');
    console.log('Examples:');
    console.log('  node data-migration.js status');
    console.log('  node data-migration.js up');
    console.log('  node data-migration.js up --target 001_initial_setup');
    console.log('  node data-migration.js down --target 001_initial_setup');
    console.log('  node data-migration.js create add_user_preferences');
  }

  /**
   * Connect to MongoDB database
   */
  async connectDatabase() {
    console.log(`${colors.blue}🔗 Connecting to database...${colors.reset}`);

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    try {
      await mongoose.connect(mongoUri);
      console.log(`   ✅ Connected to: ${mongoose.connection.host}/${mongoose.connection.name}`);
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Initialize migration tracking collection
   */
  async initializeMigrationTracking() {
    console.log(`${colors.blue}🗃️  Initializing migration tracking...${colors.reset}`);

    // Create migrations collection if it doesn't exist
    const collections = await mongoose.connection.db.listCollections({ name: 'migrations' }).toArray();
    
    if (collections.length === 0) {
      await mongoose.connection.db.createCollection('migrations');
      console.log(`   ✅ Created migrations collection`);
    }

    // Load applied migrations
    const applied = await mongoose.connection.db.collection('migrations')
      .find({})
      .sort({ appliedAt: 1 })
      .toArray();

    this.appliedMigrations = applied.map(m => m.name);
    console.log(`   📊 Found ${this.appliedMigrations.length} applied migrations`);
  }

  /**
   * Discover available migration files
   */
  async discoverMigrations() {
    console.log(`${colors.blue}🔍 Discovering migrations...${colors.reset}`);

    // Create migrations directory if it doesn't exist
    if (!fs.existsSync(this.migrationPath)) {
      fs.mkdirSync(this.migrationPath, { recursive: true });
      console.log(`   📁 Created migrations directory: ${this.migrationPath}`);
    }

    // Read migration files
    const files = fs.readdirSync(this.migrationPath)
      .filter(file => file.endsWith('.js'))
      .sort();

    const allMigrations = files.map(file => file.replace('.js', ''));

    // Determine pending migrations
    this.pendingMigrations = allMigrations.filter(
      migration => !this.appliedMigrations.includes(migration)
    );

    console.log(`   📋 Total migrations: ${allMigrations.length}`);
    console.log(`   ⏳ Pending migrations: ${this.pendingMigrations.length}`);
  }

  /**
   * Show migration status
   */
  async showMigrationStatus() {
    console.log(`\n${colors.cyan}${colors.bright}📊 Migration Status${colors.reset}`);
    console.log('═'.repeat(60));

    if (this.appliedMigrations.length > 0) {
      console.log(`\n${colors.green}Applied Migrations:${colors.reset}`);
      for (const migration of this.appliedMigrations) {
        console.log(`   ✅ ${migration}`);
      }
    }

    if (this.pendingMigrations.length > 0) {
      console.log(`\n${colors.yellow}Pending Migrations:${colors.reset}`);
      for (const migration of this.pendingMigrations) {
        console.log(`   ⏳ ${migration}`);
      }
    }

    if (this.appliedMigrations.length === 0 && this.pendingMigrations.length === 0) {
      console.log(`\n${colors.blue}No migrations found${colors.reset}`);
    }

    console.log('\n' + '═'.repeat(60));
  }

  /**
   * Run pending migrations
   */
  async runMigrations(target = null) {
    console.log(`\n${colors.blue}🚀 Running migrations...${colors.reset}`);

    if (this.pendingMigrations.length === 0) {
      console.log(`   ✅ No pending migrations to run`);
      return;
    }

    let migrationsToRun = this.pendingMigrations;

    // Filter to target if specified
    if (target) {
      const targetIndex = migrationsToRun.indexOf(target);
      if (targetIndex === -1) {
        throw new Error(`Target migration not found: ${target}`);
      }
      migrationsToRun = migrationsToRun.slice(0, targetIndex + 1);
    }

    console.log(`   📋 Running ${migrationsToRun.length} migrations\n`);

    for (const migrationName of migrationsToRun) {
      await this.runSingleMigration(migrationName, 'up');
    }
  }

  /**
   * Rollback applied migrations
   */
  async rollbackMigrations(target = null) {
    console.log(`\n${colors.blue}🔄 Rolling back migrations...${colors.reset}`);

    if (this.appliedMigrations.length === 0) {
      console.log(`   ✅ No applied migrations to rollback`);
      return;
    }

    let migrationsToRollback = [...this.appliedMigrations].reverse();

    // Filter to target if specified
    if (target) {
      const targetIndex = this.appliedMigrations.indexOf(target);
      if (targetIndex === -1) {
        throw new Error(`Target migration not found: ${target}`);
      }
      migrationsToRollback = migrationsToRollback.slice(0, this.appliedMigrations.length - targetIndex);
    }

    console.log(`   📋 Rolling back ${migrationsToRollback.length} migrations\n`);

    for (const migrationName of migrationsToRollback) {
      await this.runSingleMigration(migrationName, 'down');
    }
  }

  /**
   * Run a single migration
   */
  async runSingleMigration(migrationName, direction) {
    const startTime = Date.now();
    
    try {
      console.log(`${colors.blue}   ${direction === 'up' ? '⬆️' : '⬇️'}  ${migrationName}${colors.reset}`);

      // Load migration module
      const migrationPath = path.join(this.migrationPath, `${migrationName}.js`);
      
      if (!fs.existsSync(migrationPath)) {
        throw new Error(`Migration file not found: ${migrationPath}`);
      }

      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(migrationPath)];
      const migration = require(migrationPath);

      // Validate migration structure
      if (!migration.up || !migration.down) {
        throw new Error(`Migration must export 'up' and 'down' functions`);
      }

      // Execute migration
      if (direction === 'up') {
        await migration.up(mongoose.connection.db, mongoose);
        
        // Record migration as applied
        await mongoose.connection.db.collection('migrations').insertOne({
          name: migrationName,
          appliedAt: new Date(),
          duration: Date.now() - startTime
        });

        this.appliedMigrations.push(migrationName);
        this.pendingMigrations = this.pendingMigrations.filter(m => m !== migrationName);
        
      } else {
        await migration.down(mongoose.connection.db, mongoose);
        
        // Remove migration record
        await mongoose.connection.db.collection('migrations').deleteOne({
          name: migrationName
        });

        this.appliedMigrations = this.appliedMigrations.filter(m => m !== migrationName);
        this.pendingMigrations.unshift(migrationName);
      }

      const duration = Date.now() - startTime;
      console.log(`      ✅ Completed in ${duration}ms`);
      this.stats.migrated++;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`      ❌ Failed in ${duration}ms: ${error.message}`);
      this.stats.failed++;
      throw error;
    }
  }

  /**
   * Create a new migration file
   */
  async createMigration(name) {
    if (!name) {
      throw new Error('Migration name is required');
    }

    console.log(`${colors.blue}📝 Creating migration: ${name}${colors.reset}`);

    // Generate migration filename with timestamp
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, -5);
    
    const filename = `${timestamp}_${name}.js`;
    const filepath = path.join(this.migrationPath, filename);

    // Check if file already exists
    if (fs.existsSync(filepath)) {
      throw new Error(`Migration file already exists: ${filename}`);
    }

    // Create migration template
    const template = this.generateMigrationTemplate(name);
    
    // Write migration file
    fs.writeFileSync(filepath, template);

    console.log(`   ✅ Created migration file: ${filename}`);
    console.log(`   📁 Location: ${filepath}`);
    console.log(`\n${colors.yellow}Next steps:${colors.reset}`);
    console.log(`   1. Edit the migration file to implement your changes`);
    console.log(`   2. Run 'node data-migration.js up' to apply the migration`);
  }

  /**
   * Generate migration template
   */
  generateMigrationTemplate(name) {
    return `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

/**
 * Apply migration
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {import('mongoose')} mongoose - Mongoose instance
 */
async function up(db, mongoose) {
  console.log('Running migration: ${name}');
  
  // TODO: Implement your migration logic here
  // Examples:
  
  // 1. Add a new field to all documents in a collection
  // await db.collection('users').updateMany(
  //   {},
  //   { $set: { newField: 'defaultValue' } }
  // );
  
  // 2. Create a new index
  // await db.collection('products').createIndex({ name: 1 });
  
  // 3. Rename a field
  // await db.collection('orders').updateMany(
  //   {},
  //   { $rename: { oldFieldName: 'newFieldName' } }
  // );
  
  // 4. Transform data
  // const cursor = db.collection('items').find({});
  // while (await cursor.hasNext()) {
  //   const doc = await cursor.next();
  //   // Transform document
  //   await db.collection('items').updateOne(
  //     { _id: doc._id },
  //     { $set: { transformedField: doc.oldField.toUpperCase() } }
  //   );
  // }
}

/**
 * Rollback migration
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {import('mongoose')} mongoose - Mongoose instance
 */
async function down(db, mongoose) {
  console.log('Rolling back migration: ${name}');
  
  // TODO: Implement rollback logic here
  // This should undo the changes made in the up() function
  
  // Examples:
  
  // 1. Remove the field added in up()
  // await db.collection('users').updateMany(
  //   {},
  //   { $unset: { newField: '' } }
  // );
  
  // 2. Drop the index created in up()
  // await db.collection('products').dropIndex({ name: 1 });
  
  // 3. Rename field back
  // await db.collection('orders').updateMany(
  //   {},
  //   { $rename: { newFieldName: 'oldFieldName' } }
  // );
}

module.exports = {
  up,
  down
};
`;
  }

  /**
   * Print migration summary
   */
  printSummary() {
    console.log(`\n${colors.cyan}${colors.bright}📊 Migration Summary${colors.reset}`);
    console.log('═'.repeat(50));
    console.log(`Migrated:       ${this.stats.migrated}`);
    console.log(`Skipped:        ${this.stats.skipped}`);
    console.log(`Failed:         ${this.stats.failed}`);
    console.log(`Duration:       ${this.formatDuration(this.stats.duration)}`);
    console.log('═'.repeat(50));
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Execute migration if called directly
if (require.main === module) {
  const migration = new DataMigration();
  migration.execute().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = DataMigration;
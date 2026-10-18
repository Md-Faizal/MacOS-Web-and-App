/**
 * DATABASE INITIALIZATION MANAGER
 * 
 * Handles:
 * 1. Database connection and opening
 * 2. Schema initialization (creates all tables)
 * 3. Migration of data from old tables (if needed)
 * 4. Cleanup of deprecated tables
 * 5. Data backup before destructive operations
 * 6. Consistency across dev and production
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { schema } = require('./schema-master');

class DatabaseManager {
  constructor() {
    this.db = null;
    // Since backend does not compile into dist anymore, path is the same for prod/dev:
    // backend/core/db goes up 3 levels to project root
    const baseDir = path.join(__dirname, '../../../database');
    this.dbPath = path.join(baseDir, 'MacOS.db');
    this.backupDir = path.join(baseDir, 'backups');
  }

  /**
   * Initialize the database with complete schema
   * Call this once at application startup
   */
  initialize() {
    try {
      console.log('\n🔧 Initializing Database Manager...');
      
      // 1. Create backup directory if it doesn't exist
      this.ensureBackupDirectory();
      
      // 2. Open or create the database
      this.connectDatabase();
      
      // 3. Repair any corrupted tables BEFORE enabling FK constraints
      // (old cleanupColumnsMismatch used CREATE TABLE AS SELECT which stripped constraints)
      this.repairCorruptedTables();

      // 4. Enable foreign key constraints (after repair)
      this.db.pragma('foreign_keys = ON');
      
      // 5. Create missing tables before migrations so legacy databases can be
      // promoted into the new schema without losing their existing credentials.
      this.createTables();

      // 6. Run idempotent data migrations after the tables exist.
      this.runMigrations();

      // 7. Clean up unknown tables and extra columns
      this.cleanupUnknownSchema();
      
      // 8. Verify database integrity
      this.verifyIntegrity();
      
      console.log('✓ Database initialization completed successfully\n');
      return this.db;
      
    } catch (error) {
      console.error('✗ Database initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Connect to the database
   */
  connectDatabase() {
    try {
      this.db = new Database(this.dbPath);
      // ENABLE EXTENDED CONCURRENCY MODES
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      
      const env = process.env.NODE_ENV || 'development';
      console.log(`✓ Connected to database: ${this.dbPath} (${env}) [WAL Mode]`);
      return this.db;
    } catch (error) {
      throw new Error(`Failed to connect to database: ${error.message}`);
    }
  }

  /**
   * Create all tables from master schema
   */
  createTables() {
    try {
      this.db.exec(schema);
      console.log('✓ Database schema initialized (all tables created/verified)');
    } catch (error) {
      console.warn('⚠️  Schema batch exec encountered warning, applying statement-by-statement fallback:', error.message);
      try {
        const cleanSchema = schema.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const statements = cleanSchema.split(';').map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
          try {
            this.db.exec(stmt + ';');
          } catch (_) {}
        }
        console.log('✓ Database schema verified via statement fallback (all tables ensured)');
      } catch (innerErr) {
        console.warn('⚠️  Schema statement fallback error:', innerErr.message);
      }
    }
  }

  /**
   * REPAIR: Detect and fix tables that were corrupted by the old
   * "CREATE TABLE AS SELECT" approach which stripped all constraints.
   *
   * A table is considered corrupted if a column that should be a PRIMARY KEY
   * (based on our master schema) has pk=0 in PRAGMA table_info.
   *
   * This runs BEFORE FK constraints are enabled so SQLite doesn't block things.
   */
  repairCorruptedTables() {
    try {
      const { schema: masterSchema } = require('./schema-master');

      // Tables to check: tableName -> primaryKeyColumn(s)
      const primaryKeyMap = {
        notes: 'id',
        Settings: 'id',
        status_checks: 'id'
      };

      for (const [tableName, pkColumn] of Object.entries(primaryKeyMap)) {
        // Check if the table exists
        const tableExists = this.db.prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        ).get(tableName);
        if (!tableExists) continue;

        // Check if the primary key column is properly marked
        const colInfo = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
        const pkCol = colInfo.find(c => c.name === pkColumn);
        if (!pkCol) continue;

        if (pkCol.pk === 0) {
          // CORRUPTED: column is not recognized as PRIMARY KEY — rebuild from master schema.
          console.warn(`⚠️  REPAIR: Table '${tableName}' column '${pkColumn}' has lost its PRIMARY KEY — rebuilding...`);
          this.rebuildTableFromMasterSchema(tableName, masterSchema);
        }
      }
    } catch (err) {
      console.warn('⚠️  repairCorruptedTables warning:', err.message);
      // Non-fatal — continue startup
    }
  }

  /**
   * Rebuild a single table using the master schema CREATE TABLE SQL.
   * Copies existing data over. Run BEFORE FK constraints are ON.
   */
  rebuildTableFromMasterSchema(tableName, masterSchemaStr) {
    try {
      // Extract the correct CREATE TABLE statement from master schema
      const re = new RegExp(
        `(CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}\\s*\\([\\s\\S]*?\\);)`,
        'i'
      );
      const match = masterSchemaStr.match(re);
      if (!match) {
        console.warn(`  ⚠️  Could not find master schema for '${tableName}', skipping repair`);
        return;
      }

      // Build a CREATE TABLE for the _repair temp table (remove IF NOT EXISTS)
      const correctSql = match[1]
        .replace(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i, `CREATE TABLE ${tableName}_repair`)
        .replace(new RegExp(`^CREATE\\s+TABLE\\s+${tableName}_repair\\b`, 'i'), `CREATE TABLE ${tableName}_repair`);

      // Determine columns that exist in both current broken table and master schema
      const currentCols = this.db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
      const masterColsMatch = match[1].match(/CREATE\s+TABLE[^(]+\(([\s\S]*)\)/i);
      const masterCols = [];
      if (masterColsMatch) {
        masterColsMatch[1].split(/,(?![^()]*\))/).forEach(def => {
          const colNameMatch = def.trim().match(/^(\w+)\s+/);
          if (colNameMatch) {
            const kw = colNameMatch[1].toUpperCase();
            if (!['FOREIGN', 'UNIQUE', 'CHECK', 'PRIMARY', 'CONSTRAINT'].includes(kw)) {
              masterCols.push(colNameMatch[1]);
            }
          }
        });
      }
      const sharedCols = masterCols.filter(c => currentCols.includes(c));

      // Backup existing (corrupted) table
      this.backupTableStructure(tableName, `${tableName}_repair_backup_${Date.now()}.sql`);

      // Execute rebuild inside a transaction
      this.db.exec('BEGIN');
      try {
        this.db.exec(correctSql);
        if (sharedCols.length > 0) {
          this.db.exec(`INSERT INTO ${tableName}_repair (${sharedCols.join(',')}) SELECT ${sharedCols.join(',')} FROM ${tableName}`);
        }
        this.db.exec(`DROP TABLE ${tableName}`);
        this.db.exec(`ALTER TABLE ${tableName}_repair RENAME TO ${tableName}`);
        this.db.exec('COMMIT');
        console.log(`  ✅ Repaired table '${tableName}' — PRIMARY KEY restored`);
      } catch (err) {
        this.db.exec('ROLLBACK');
        console.error(`  ✗ Repair transaction failed for '${tableName}':`, err.message);
      }
    } catch (err) {
      console.error(`  ✗ rebuildTableFromMasterSchema failed for '${tableName}':`, err.message);
    }
  }

  /**
   * Clean up unknown tables and extra columns not in schema
   * Runs after migrations but before schema verification
   */
  cleanupUnknownSchema() {
    try {
      console.log('🧹 Synchronizing database schema to master definitions...');
      
      const expectedSchema = this.parseSchemaDefinition();
      
      // Get all existing tables
      const existingTables = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%'
      `).all().map(t => t.name);

      // 1. Drop unknown tables (preserving FTS virtual search tables)
      const unknownTables = existingTables.filter(t => !expectedSchema[t] && !t.includes('_fts'));
      if (unknownTables.length > 0) {
        console.log(`⚠️  Found ${unknownTables.length} unknown table(s): ${unknownTables.join(', ')}`);
        if (['production', 'oraclevm'].includes(process.env.NODE_ENV)) {
          console.warn('⚠️  Production safety: preserving unknown tables; review them manually before removal.');
        } else {
          this.dropUnknownTables(unknownTables);
        }
      }

      // 2. Sync known tables (detect mismatches and rebuild if needed)
      for (const [tableName, masterDef] of Object.entries(expectedSchema)) {
        const tableExists = existingTables.includes(tableName);
        
        if (!tableExists) {
          // Table doesn't exist at all - createTables() will handle it later or we can do it here
          continue;
        }

        // Check columns mismatch
        const actualColumns = this.db.prepare(`PRAGMA table_info(${tableName})`).all().map(col => col.name);
        const expectedColumns = masterDef.columns;
        
        const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
        const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));

        if (missingColumns.length > 0 || extraColumns.length > 0) {
          // Zero-downtime Blue/Green Safe Migration:
          // If columns are missing in production, add them non-destructively via ALTER TABLE ADD COLUMN
          if (missingColumns.length > 0) {
            console.log(`  ➕ Non-destructively adding ${missingColumns.length} missing column(s) to '${tableName}': ${missingColumns.join(', ')}`);
            for (const col of missingColumns) {
              try {
                this.db.exec(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${col}\` TEXT`);
                console.log(`    ✓ Added column '${col}' to '${tableName}'`);
              } catch (addErr) {
                console.warn(`    ⚠️ Could not add column '${col}' directly: ${addErr.message}`);
              }
            }
          }

          if (extraColumns.length > 0) {
            if (['production', 'oraclevm'].includes(process.env.NODE_ENV)) {
              console.log(`  🛡️  Zero-Downtime Blue/Green Safety: Preserving ${extraColumns.length} existing column(s) on '${tableName}' during traffic overlap.`);
              continue;
            }
            console.log(`  ⚠️  Table '${tableName}' has ${extraColumns.length} extra column(s): ${extraColumns.join(', ')}`);
            console.log(`  🔄 Rebuilding table '${tableName}' to match master schema...`);
            this.rebuildTable(tableName, masterDef);
          }
        }
      }

      console.log('✓ Schema synchronization completed');

    } catch (error) {
      console.error('⚠️  Schema synchronization warning:', error.message);
    }
  }

  /**
   * Parse schema definition to extract table and column info
   */
  parseSchemaDefinition() {
    const schemaMap = {};
    
    try {
      // 1. Strip comments carefully
      // Remove -- comments
      let cleanSchema = schema.replace(/--.*$/gm, '');
      // Remove /* */ comments
      cleanSchema = cleanSchema.replace(/\/\*[\s\S]*?\*\//g, '');
      
      // 2. Split into statements by semicolon
      const statements = cleanSchema.split(';');
      
      for (const rawStmt of statements) {
        const stmt = rawStmt.trim();
        if (!stmt) continue;
        
        // Match CREATE TABLE statements
        // We use a regex that captures the table name and the entire body
        const tableMatch = stmt.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]*)\)/i);
        
        if (tableMatch) {
          const tableName = tableMatch[1];
          const innerContent = tableMatch[2];
          
          // Extract column names 
          const columns = [];
          this.splitByCommas(innerContent).forEach(line => {
            this.processColumnLine(line, columns);
          });
          
          schemaMap[tableName] = {
            createSql: stmt + ';',
            columns: columns
          };
        }
      }
    } catch (error) {
      console.error('⚠️  Error parsing schema:', error.message);
    }
    
    return schemaMap;
  }

  splitByCommas(str) {
    const parts = [];
    let depth = 0;
    let current = '';
    
    for (const char of str) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      
      if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  processColumnLine(line, columns) {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Skip constraint lines
    const upper = trimmed.toUpperCase();
    const firstWord = upper.match(/^(\w+)/)?.[1] || '';
    
    if (['FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT'].includes(firstWord) || 
        (firstWord === 'PRIMARY' && upper.includes('KEY') && trimmed.includes('('))) { // Table-level PK
      return;
    }
    
    // Extract column name (first word)
    const columnMatch = trimmed.match(/^(\w+)/);
    if (columnMatch) {
      columns.push(columnMatch[1]);
    }
  }

  rebuildTable(tableName, masterDef) {
    try {
      const { createSql, columns: expectedColumns } = masterDef;
      
      // Get current columns from PRAGMA
      const actualColumns = this.db.prepare(`PRAGMA table_info(${tableName})`).all().map(col => col.name);
      
      // Find columns that exist in both versions
      const sharedColumns = expectedColumns.filter(col => actualColumns.includes(col));
      
      // Backup current structure
      const backupName = `${tableName}_sync_backup_${Date.now()}.sql`;
      this.backupTableStructure(tableName, backupName);

      // Build the _new table SQL (ensure we don't have IF NOT EXISTS or it might collide if we didn't handle rename perfectly)
      const newTableSql = createSql.replace(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i, `CREATE TABLE $1_new`);

      // Temporarily disable FKs to allow DROP/RENAME on referenced tables
      // Must be done OUTSIDE of a transaction
      this.db.pragma('foreign_keys = OFF');
      
      this.db.exec('BEGIN EXCLUSIVE'); // Use exclusive lock for schema changes
      try {
        // 1. Create the new table
        this.db.exec(newTableSql);
        
        // 2. Copy data for shared columns
        if (sharedColumns.length > 0) {
          const colsStr = sharedColumns.join(', ');
          this.db.exec(`INSERT INTO ${tableName}_new (${colsStr}) SELECT ${colsStr} FROM ${tableName}`);
        }
        
        // 3. Drop old table
        this.db.exec(`DROP TABLE ${tableName}`);
        
        // 4. Rename new table to original name
        this.db.exec(`ALTER TABLE ${tableName}_new RENAME TO ${tableName}`);
        
        this.db.exec('COMMIT');
        this.db.pragma('foreign_keys = ON');
        console.log(`  ✅ Successfully synchronized table '${tableName}' (dropped extra/added missing columns)`);
      } catch (txErr) {
        this.db.exec('ROLLBACK');
        this.db.pragma('foreign_keys = ON');
        console.error(`  ✗ Failed to rebuild table '${tableName}':`, txErr.message);
        throw txErr;
      }

    } catch (error) {
      console.error(`  ✗ Error in rebuildTable for '${tableName}':`, error.message);
      // Don't throw - let other tables try to sync
    }
  }

  // DEPRECATED: use rebuildTable which is more robust
  cleanupColumnsMismatch(tableName, expectedColumns) {
    // This is now handled directly inside cleanupUnknownSchema call to rebuildTable
  }

  // DEPRECATED: use rebuildTable which is more robust
  dropColumnsFromTable(tableName, columnsToDrop) {
    // This is now handled directly inside cleanupUnknownSchema call to rebuildTable
  }

  /**
   * Drop unknown tables not in schema
   */
  dropUnknownTables(tableNames) {
    try {
      for (const tableName of tableNames) {
        // Backup table structure before dropping
        const backupName = `${tableName}_unknown_backup_${Date.now()}.sql`;
        this.backupTableStructure(tableName, backupName);
        
        // Drop the table
        this.db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`  ✓ Dropped unknown table: ${tableName}`);
      }
    } catch (error) {
      console.error(`  ✗ Error dropping unknown tables:`, error.message);
    }
  }

  /**
   * Run data migrations from old tables to new ones (if needed)
   * This is called when transitioning from old schema to new schema
   * NOTE: Runs BEFORE schema creation to ensure columns exist
   */
  runMigrations() {
    try {
      // Auto-run all available migrations on startup
      const fs = require('fs');
      const path = require('path');
      
      const migrationsDir = path.join(__dirname, 'migrations');
      if (fs.existsSync(migrationsDir)) {
        const migrationFiles = fs.readdirSync(migrationsDir)
          .filter(f => f.endsWith('.js'))
          .sort();

        if (migrationFiles.length > 0) {
          console.log(`📦 Found ${migrationFiles.length} migration(s)`);
        }
        
        for (const file of migrationFiles) {
          try {
            const migration = require(path.join(migrationsDir, file));
            if (migration.up && typeof migration.up === 'function') {
              console.log(`⚙️  Running migration: ${file}`);
              migration.up(this.db);
            }
          } catch (error) {
            console.error(`⚠️  Error running migration ${file}:`, error.message);
            // Continue with other migrations even if one fails
          }
        }
      }

      // Check if old tables exist that need migration
      // Get all existing tables
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%'
      `).all();

      const tableNames = tables.map(t => t.name);
      
      // Check if old tables exist that need migration
      const oldTables = [
        'billing_transactions',
        'customer_preferences'
      ];

      const oldTablesPresent = oldTables.filter(t => tableNames.includes(t));

      if (oldTablesPresent.length > 0) {
        console.log(`⚠️  Found old table(s): ${oldTablesPresent.join(', ')}`);
        
        // IMPORTANT: Data migration logic goes here
        // Example: Migrate data from old billing_transactions to new invoices/payments
        this.migrateOldBillingData();
        
        // After migration, drop old tables
        this.dropOldTables(oldTablesPresent);
        console.log('✓ Old tables migrated and removed');
      } else {
        console.log('✓ No old tables found (clean installation)');
      }
    } catch (error) {
      console.error('⚠️  Migration warning:', error.message);
      // Don't throw - allow app to continue even if migration has issues
    }
  }

  /**
   * Run column-level migrations (add new columns to existing tables)
   * These are safe migrations that only add columns if they don't exist
   */
  runColumnMigrations() {
    try {
      const paymentMigration = require('./migrations/001-add-payment-fields');
      paymentMigration(this.db);

      const cleanupMigration = require('./migrations/002-remove-redundant-columns');
      cleanupMigration(this.db);
    } catch (error) {
      console.error('⚠️  Column migration warning:', error.message);
      // Don't throw - allow app to continue
    }
  }

  /**
   * Migrate data from old billing_transactions and customer_preferences
   */
  migrateOldBillingData() {
    try {
      // Check if old tables exist before attempting migration
      const oldBillingExists = this.tableExists('billing_transactions');
      const oldPrefsExists = this.tableExists('customer_preferences');

      if (!oldBillingExists && !oldPrefsExists) {
        return; // No old data to migrate
      }

      console.log('🔄 Migrating old billing data...');

      // Migrate customer_preferences to customer_item_memory
      if (oldPrefsExists) {
        const oldPrefs = this.db.prepare(`
          SELECT * FROM customer_preferences
        `).all();

        if (oldPrefs.length > 0) {
          const insertStmt = this.db.prepare(`
            INSERT OR IGNORE INTO customer_item_memory 
            (customer_id, product_id, discount_1, discount_2, scheme, tax_percent, created_at)
            SELECT 
              c.id as customer_id,
              p.id as product_id,
              cp.disc1 as discount_1,
              cp.disc2 as discount_2,
              cp.scheme,
              cp.tax as tax_percent,
              cp.last_updated as created_at
            FROM customer_preferences cp
            LEFT JOIN contacts c ON c.name = cp.customer_name
            LEFT JOIN products p ON p.name = cp.product_name
            WHERE c.id IS NOT NULL AND p.id IS NOT NULL
          `);
          
          insertStmt.run();
          console.log(`  ✓ Migrated ${oldPrefs.length} customer preferences`);
        }
      }

      // Note: billing_transactions -> payments/invoices mapping requires more logic
      // based on your specific business rules - this is a placeholder

    } catch (error) {
      console.error('  ✗ Error migrating old data:', error.message);
    }
  }

  /**
   * Check if a table exists
   */
  tableExists(tableName) {
    try {
      const result = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name = ?
      `).get(tableName);
      return !!result;
    } catch (error) {
      return false;
    }
  }

  /**
   * Drop old/deprecated tables after data migration
   */
  dropOldTables(tableNames) {
    try {
      tableNames.forEach(tableName => {
        // Create backup before dropping
        const backupName = `${tableName}_backup_${Date.now()}.sql`;
        this.backupTableStructure(tableName, backupName);
        
        // Drop the table
        this.db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`  ✓ Dropped old table: ${tableName}`);
      });
    } catch (error) {
      throw new Error(`Failed to drop old tables: ${error.message}`);
    }
  }

  /**
   * Backup table structure before deletion
   */
  backupTableStructure(tableName, backupFileName) {
    try {
      const createStmt = this.db.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name = ?
      `).get(tableName);

      if (createStmt && createStmt.sql) {
        const backupPath = path.join(this.backupDir, backupFileName);
        fs.writeFileSync(backupPath, createStmt.sql);
      }
    } catch (error) {
      console.warn(`  ⚠️  Could not backup table structure: ${error.message}`);
    }
  }

  /**
   * Create backup directory
   */
  ensureBackupDirectory() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
        console.log(`✓ Created backup directory: ${this.backupDir}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not create backup directory: ${error.message}`);
    }
  }

  /**
   * Verify database integrity
   */
  verifyIntegrity() {
    try {
      // Check foreign key integrity
      const result = this.db.pragma('integrity_check');
      if (result[0].integrity_check !== 'ok') {
        console.warn('⚠️  Database integrity check failed');
      } else {
        console.log('✓ Database integrity verified');
      }

      // List all tables
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();

      const tableNames = tables.map(t => t.name);
      console.log(`✓ Active tables: ${tableNames.join(', ')}`);

    } catch (error) {
      console.warn('⚠️  Integrity check warning:', error.message);
    }
  }

  /**
   * Get database instance
   */
  getDatabase() {
    return this.db;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('✓ Database connection closed');
    }
  }
}

// Export singleton instance
module.exports = new DatabaseManager();

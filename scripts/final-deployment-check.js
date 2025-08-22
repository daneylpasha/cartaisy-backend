#!/usr/bin/env node

/**
 * Final Deployment Readiness Check
 * Validates all systems are ready for production deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Cartaisy Backend - Final Deployment Readiness Check\n');

const checks = [];
let allPassed = true;

// Helper function to add check result
function addCheck(name, passed, details = '') {
  checks.push({ name, passed, details });
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}${details ? ` - ${details}` : ''}`);
  if (!passed) allPassed = false;
}

// Check 1: Verify all required files exist
console.log('📁 Checking required files...');
const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'Dockerfile',
  'docker-compose.yml',
  '.env.template.production',
  'src/server.ts',
  'src/config/database.ts',
  'src/config/deployment.ts',
  'README.md',
  'docs/API-REFERENCE.md',
  'docs/DEPLOYMENT.md',
  'docs/ARCHITECTURE.md',
  'docs/SECURITY.md',
  'docs/CLIENT-ONBOARDING.md',
  'docs/MAINTENANCE.md',
  'docs/PRESENTATION.md'
];

const missingFiles = [];
requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, '..', file));
  if (!exists) missingFiles.push(file);
});

addCheck('Required Files Check', missingFiles.length === 0, 
  missingFiles.length > 0 ? `Missing: ${missingFiles.join(', ')}` : 'All files present');

// Check 2: Validate package.json
console.log('\n📦 Checking package.json configuration...');
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  
  const requiredScripts = ['start', 'build', 'dev', 'test'];
  const missingScripts = requiredScripts.filter(script => !packageJson.scripts[script]);
  
  addCheck('Package Scripts', missingScripts.length === 0,
    missingScripts.length > 0 ? `Missing: ${missingScripts.join(', ')}` : 'All scripts defined');
  
  addCheck('Production Dependencies', packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0);
} catch (error) {
  addCheck('Package.json Validation', false, 'Invalid JSON format');
}

// Check 3: TypeScript compilation
console.log('\n🔧 Checking TypeScript compilation...');
try {
  execSync('npx tsc --noEmit', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  addCheck('TypeScript Compilation', true, 'No compilation errors');
} catch (error) {
  addCheck('TypeScript Compilation', false, 'Compilation errors found');
}

// Check 4: ESLint validation
console.log('\n📏 Checking code quality...');
try {
  execSync('npx eslint src --ext .ts --max-warnings 0', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  addCheck('ESLint Validation', true, 'No linting errors');
} catch (error) {
  addCheck('ESLint Validation', false, 'Linting errors found');
}

// Check 5: Environment template validation
console.log('\n🔧 Checking environment templates...');
const envTemplates = [
  '.env.template.development',
  '.env.template.staging',
  '.env.template.production'
];

envTemplates.forEach(template => {
  const exists = fs.existsSync(path.join(__dirname, '..', template));
  addCheck(`Environment Template: ${template}`, exists);
});

// Check 6: Docker configuration
console.log('\n🐳 Checking Docker configuration...');
const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.production.yml', '.dockerignore'];
const missingDockerFiles = dockerFiles.filter(file => 
  !fs.existsSync(path.join(__dirname, '..', file))
);

addCheck('Docker Configuration', missingDockerFiles.length === 0,
  missingDockerFiles.length > 0 ? `Missing: ${missingDockerFiles.join(', ')}` : 'All Docker files present');

// Check 7: CI/CD Templates
console.log('\n🔄 Checking CI/CD templates...');
const ciFiles = [
  '.github/workflows/ci.yml',
  '.github/workflows/cd.yml',
  '.gitlab-ci.yml'
];

const existingCiFiles = ciFiles.filter(file => 
  fs.existsSync(path.join(__dirname, '..', file))
);

addCheck('CI/CD Templates', existingCiFiles.length >= 2, 
  `Available: ${existingCiFiles.length}/3 templates`);

// Check 8: Documentation completeness
console.log('\n📚 Checking documentation completeness...');
const docFiles = [
  'docs/API-REFERENCE.md',
  'docs/DEPLOYMENT.md',
  'docs/ARCHITECTURE.md',
  'docs/SECURITY.md',
  'docs/CLIENT-ONBOARDING.md',
  'docs/MAINTENANCE.md',
  'docs/PRESENTATION.md'
];

const missingDocs = docFiles.filter(doc => 
  !fs.existsSync(path.join(__dirname, '..', doc))
);

addCheck('Documentation Package', missingDocs.length === 0,
  missingDocs.length > 0 ? `Missing: ${missingDocs.join(', ')}` : 'Complete documentation package');

// Check 9: Security configuration
console.log('\n🔒 Checking security configuration...');
try {
  const securityDoc = fs.readFileSync(path.join(__dirname, '..', 'docs/SECURITY.md'), 'utf8');
  const hasSecurityFeatures = [
    'JWT Authentication',
    'Rate Limiting',
    'CORS Configuration',
    'Input Validation',
    'Security Headers'
  ].every(feature => securityDoc.includes(feature));
  
  addCheck('Security Documentation', hasSecurityFeatures, 'All security features documented');
} catch (error) {
  addCheck('Security Documentation', false, 'Security documentation missing or incomplete');
}

// Check 10: Database scripts
console.log('\n🗄️ Checking database scripts...');
const dbScripts = [
  'scripts/backup-database.js',
  'scripts/restore-database.js',
  'scripts/data-migration.js'
];

const missingDbScripts = dbScripts.filter(script => 
  !fs.existsSync(path.join(__dirname, '..', script))
);

addCheck('Database Scripts', missingDbScripts.length === 0,
  missingDbScripts.length > 0 ? `Missing: ${missingDbScripts.join(', ')}` : 'All database scripts present');

// Final Report
console.log('\n' + '='.repeat(60));
console.log('📋 FINAL DEPLOYMENT READINESS REPORT');
console.log('='.repeat(60));

console.log(`\n✅ Passed: ${checks.filter(c => c.passed).length}`);
console.log(`❌ Failed: ${checks.filter(c => !c.passed).length}`);
console.log(`📊 Total Checks: ${checks.length}`);

if (allPassed) {
  console.log('\n🎉 DEPLOYMENT READY! 🎉');
  console.log('✅ All checks passed - System is ready for production deployment');
  console.log('\n📋 Next Steps:');
  console.log('   1. Review docs/DEPLOYMENT.md for deployment instructions');
  console.log('   2. Configure production environment variables');
  console.log('   3. Set up monitoring and alerting');
  console.log('   4. Schedule client onboarding session');
  console.log('\n📞 Support: support@cartaisy.com');
} else {
  console.log('\n⚠️ DEPLOYMENT NOT READY');
  console.log('❌ Some checks failed - Please resolve issues before deployment');
  console.log('\n🔧 Failed Checks:');
  checks.filter(c => !c.passed).forEach(check => {
    console.log(`   • ${check.name}${check.details ? ` - ${check.details}` : ''}`);
  });
}

console.log('\n' + '='.repeat(60));

// Exit with appropriate code
process.exit(allPassed ? 0 : 1);
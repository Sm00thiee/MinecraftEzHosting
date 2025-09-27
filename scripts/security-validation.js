#!/usr/bin/env node

/**
 * Security Validation Script
 * Comprehensive security checks for the MC Server Management project
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

class SecurityValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  log(level, message, file = null) {
    const entry = { message, file, timestamp: new Date().toISOString() };
    this[level].push(entry);

    const colors = {
      errors: '\x1b[31m', // Red
      warnings: '\x1b[33m', // Yellow
      info: '\x1b[36m', // Cyan
    };

    const reset = '\x1b[0m';
    const prefix = level.toUpperCase();
    const location = file ? ` (${file})` : '';

    console.log(`${colors[level]}[${prefix}]${reset} ${message}${location}`);
  }

  async checkEnvFiles() {
    console.log('\n🔍 Checking environment files...');

    // Check if .env is in .gitignore
    try {
      const gitignoreContent = await fs.readFile(
        path.join(projectRoot, '.gitignore'),
        'utf-8'
      );
      if (!gitignoreContent.includes('.env')) {
        this.log('errors', '.env file is not in .gitignore', '.gitignore');
      } else {
        this.log('info', '.env file is properly ignored by Git');
      }
    } catch (error) {
      this.log('warnings', '.gitignore file not found');
    }

    // Check if .env.example exists
    try {
      await fs.access(path.join(projectRoot, '.env.example'));
      this.log('info', '.env.example file exists');
    } catch (error) {
      this.log('warnings', '.env.example file not found');
    }

    // Check .env file for real credentials
    try {
      const envContent = await fs.readFile(
        path.join(projectRoot, '.env'),
        'utf-8'
      );
      const suspiciousPatterns = [
        /SUPABASE_URL=https:\/\/[a-z0-9]+\.supabase\.co/,
        /SUPABASE_ANON_KEY=eyJ[A-Za-z0-9_-]+/,
        /SUPABASE_SERVICE_ROLE_KEY=eyJ[A-Za-z0-9_-]+/,
        /JWT_SECRET=[A-Fa-f0-9]{32,}/,
        /DATABASE_URL=postgresql:\/\/.*@.*\.supabase\.co/,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(envContent)) {
          this.log('errors', 'Real credentials detected in .env file', '.env');
          break;
        }
      }
    } catch (error) {
      this.log(
        'info',
        '.env file not found (this is OK if using environment variables)'
      );
    }
  }

  async checkFilePermissions() {
    console.log('\n🔒 Checking file permissions...');

    const sensitiveFiles = ['.env', '.env.local', '.env.production'];

    for (const file of sensitiveFiles) {
      try {
        const filePath = path.join(projectRoot, file);
        const stats = await fs.stat(filePath);

        // Check if file is readable by others (Unix-like systems)
        if (process.platform !== 'win32') {
          const mode = stats.mode & parseInt('777', 8);
          if (mode & parseInt('044', 8)) {
            this.log('warnings', `${file} is readable by group/others`, file);
          }
        }
      } catch (error) {
        // File doesn't exist, which is fine
      }
    }
  }

  async checkDependencyVulnerabilities() {
    console.log('\n🛡️ Checking for dependency vulnerabilities...');

    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8')
      );

      // Check for known vulnerable packages (basic check)
      const vulnerablePackages = {
        lodash: '< 4.17.21',
        axios: '< 0.21.2',
        express: '< 4.17.3',
      };

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [pkg, vulnerableVersion] of Object.entries(
        vulnerablePackages
      )) {
        if (allDeps[pkg]) {
          this.log('info', `Found ${pkg} - please ensure it's up to date`);
        }
      }
    } catch (error) {
      this.log('warnings', 'Could not read package.json');
    }
  }

  async checkDockerSecurity() {
    console.log('\n🐳 Checking Docker security...');

    const dockerFiles = [
      'Dockerfile',
      'Dockerfile.minecraft',
      'Dockerfile.frontend',
    ];

    for (const dockerFile of dockerFiles) {
      try {
        const content = await fs.readFile(
          path.join(projectRoot, dockerFile),
          'utf-8'
        );

        // Check for hardcoded secrets
        if (/ENV.*(?:PASSWORD|SECRET|KEY|TOKEN)=(?!\$\{)[^\s]+/.test(content)) {
          this.log(
            'warnings',
            'Potential hardcoded secret in Dockerfile',
            dockerFile
          );
        }

        // Check for running as root
        if (!content.includes('USER ') && !content.includes('RUN adduser')) {
          this.log('warnings', 'Container may be running as root', dockerFile);
        }

        this.log('info', `Checked ${dockerFile} for security issues`);
      } catch (error) {
        // File doesn't exist
      }
    }
  }

  async checkGitSecurity() {
    console.log('\n📝 Checking Git security...');

    try {
      // Check if pre-commit hooks are installed
      await fs.access(path.join(projectRoot, '.husky', 'pre-commit'));
      this.log('info', 'Pre-commit hooks are installed');
    } catch (error) {
      this.log('warnings', 'Pre-commit hooks not found');
    }

    // Check for credential detection script
    try {
      await fs.access(
        path.join(projectRoot, 'scripts', 'detect-credentials.js')
      );
      this.log('info', 'Credential detection script exists');
    } catch (error) {
      this.log('warnings', 'Credential detection script not found');
    }
  }

  async checkConfigurationSecurity() {
    console.log('\n⚙️ Checking configuration security...');

    const configFiles = [
      'docker-compose.yml',
      'docker-compose.prod.yml',
      'Jenkinsfile',
    ];

    for (const configFile of configFiles) {
      try {
        const content = await fs.readFile(
          path.join(projectRoot, configFile),
          'utf-8'
        );

        // Check for hardcoded credentials
        const credentialPatterns = [
          /password:\s*['"](?!\$\{)[^'"\s]+['"]/, // password: "value"
          /secret:\s*['"](?!\$\{)[^'"\s]+['"]/, // secret: "value"
          /token:\s*['"](?!\$\{)[^'"\s]+['"]/, // token: "value"
        ];

        for (const pattern of credentialPatterns) {
          if (pattern.test(content)) {
            this.log(
              'warnings',
              'Potential hardcoded credential found',
              configFile
            );
            break;
          }
        }

        this.log('info', `Checked ${configFile} for security issues`);
      } catch (error) {
        // File doesn't exist
      }
    }
  }

  async generateReport() {
    console.log('\n📊 Security Validation Report');
    console.log('='.repeat(50));

    console.log(`\n✅ Info: ${this.info.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);

    if (this.errors.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES:');
      this.errors.forEach(error => {
        console.log(
          `  ❌ ${error.message}${error.file ? ` (${error.file})` : ''}`
        );
      });
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach(warning => {
        console.log(
          `  ⚠️  ${warning.message}${warning.file ? ` (${warning.file})` : ''}`
        );
      });
    }

    // Write detailed report to file
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        errors: this.errors.length,
        warnings: this.warnings.length,
        info: this.info.length,
      },
      details: {
        errors: this.errors,
        warnings: this.warnings,
        info: this.info,
      },
    };

    await fs.writeFile(
      path.join(projectRoot, 'security-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n📄 Detailed report saved to security-report.json');

    return this.errors.length === 0;
  }

  async run() {
    console.log('🔐 Starting Security Validation...');

    await this.checkEnvFiles();
    await this.checkFilePermissions();
    await this.checkDependencyVulnerabilities();
    await this.checkDockerSecurity();
    await this.checkGitSecurity();
    await this.checkConfigurationSecurity();

    const passed = await this.generateReport();

    if (!passed) {
      console.log(
        '\n🚨 Security validation failed! Please address the critical issues above.'
      );
      process.exit(1);
    } else {
      console.log('\n✅ Security validation passed!');
      process.exit(0);
    }
  }
}

// Run the security validation
if (
  import.meta.url.endsWith(process.argv[1]) ||
  process.argv[1].endsWith('security-validation.js')
) {
  const validator = new SecurityValidator();
  validator.run().catch(error => {
    console.error('Security validation failed:', error);
    process.exit(1);
  });
}

export default SecurityValidator;

#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Patterns to detect potential credentials
const CREDENTIAL_PATTERNS = [
  // API Keys and tokens
  /['"]?[A-Za-z0-9_-]*[aA][pP][iI][_-]?[kK][eE][yY]['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/g,
  /['"]?[tT][oO][kK][eE][nN]['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/g,

  // JWT tokens
  /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,

  // Database URLs with credentials
  /postgresql:\/\/[^\s:]+:[^\s@]+@[^\s\/]+/g,
  /mysql:\/\/[^\s:]+:[^\s@]+@[^\s\/]+/g,

  // Supabase specific patterns
  /supabase\.co/g,
  /SUPABASE_[A-Z_]*\s*[:=]\s*['"][^'"\s]{20,}['"]/g,

  // Common secret patterns
  /['"]?[sS][eE][cC][rR][eE][tT]['"]?\s*[:=]\s*['"][^'"\s]{8,}['"]/g,
  /['"]?[pP][aA][sS][sS][wW][oO][rR][dD]['"]?\s*[:=]\s*['"][^'"\s]{4,}['"]/g,
  /['"]?[kK][eE][yY]['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/g,

  // Private keys
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,

  // AWS credentials
  /AKIA[0-9A-Z]{16}/g,

  // GitHub tokens
  /gh[pousr]_[A-Za-z0-9_]{36}/g,

  // Generic base64 encoded secrets (longer than 20 chars)
  /['"]?[A-Za-z0-9+\/]{20,}={0,2}['"]/g,
];

// Files to exclude from scanning
const EXCLUDED_FILES = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  '.env.example',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.husky/',
  'scripts/detect-credentials.js',
  'SECURITY_AUDIT.md',
];

// File extensions to scan
const SCAN_EXTENSIONS = [
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.json',
  '.env',
  '.yml',
  '.yaml',
  '.dockerfile',
  '.md',
  '.txt',
  '.sh',
  '.bat',
  '.ps1',
  '.py',
  '.go',
  '.java',
  '.php',
  '.rb',
  '.cs',
  '.cpp',
  '.c',
  '.h',
];

function shouldScanFile(filePath) {
  // Check if file is excluded
  for (const excluded of EXCLUDED_FILES) {
    if (filePath.includes(excluded)) {
      return false;
    }
  }

  // Check if file has scannable extension
  const ext = path.extname(filePath).toLowerCase();
  return (
    SCAN_EXTENSIONS.includes(ext) || path.basename(filePath).startsWith('.env')
  );
}

function scanFileForCredentials(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = [];

    CREDENTIAL_PATTERNS.forEach((pattern, index) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Skip obvious placeholders
          if (
            match.includes('your-') ||
            match.includes('YOUR_') ||
            match.includes('placeholder') ||
            match.includes('PLACEHOLDER') ||
            match.includes('example') ||
            match.includes('EXAMPLE') ||
            match.includes('xxx') ||
            match.includes('XXX') ||
            match.includes('***') ||
            match.includes('...')
          ) {
            return;
          }

          findings.push({
            file: filePath,
            pattern: index,
            match: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
            line: content.substring(0, content.indexOf(match)).split('\n')
              .length,
          });
        });
      }
    });

    return findings;
  } catch (error) {
    console.warn(`Warning: Could not scan file ${filePath}: ${error.message}`);
    return [];
  }
}

function getAllFiles(dir, files = []) {
  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        getAllFiles(fullPath, files);
      } else if (shouldScanFile(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dir}: ${error.message}`);
  }

  return files;
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
    });
    return output
      .trim()
      .split('\n')
      .filter(file => file && shouldScanFile(file));
  } catch (error) {
    console.warn('Warning: Could not get staged files, scanning all files');
    return null;
  }
}

function main() {
  console.log('🔍 Scanning for potential credential exposure...');

  let filesToScan;
  const stagedFiles = getStagedFiles();

  if (stagedFiles && stagedFiles.length > 0) {
    filesToScan = stagedFiles.filter(fs.existsSync);
    console.log(`Scanning ${filesToScan.length} staged files...`);
  } else {
    filesToScan = getAllFiles(process.cwd());
    console.log(`Scanning ${filesToScan.length} files in project...`);
  }

  let totalFindings = 0;
  const allFindings = [];

  for (const file of filesToScan) {
    const findings = scanFileForCredentials(file);
    if (findings.length > 0) {
      allFindings.push(...findings);
      totalFindings += findings.length;
    }
  }

  if (totalFindings > 0) {
    console.error('\n❌ POTENTIAL CREDENTIALS DETECTED!');
    console.error('\nThe following files contain potential credentials:');

    allFindings.forEach(finding => {
      console.error(`\n📁 File: ${finding.file}:${finding.line}`);
      console.error(`🔍 Match: ${finding.match}`);
    });

    console.error(
      '\n⚠️  Please review these findings and ensure no real credentials are committed.'
    );
    console.error(
      '💡 Use environment variables or secure credential management instead.'
    );
    console.error(
      '\n🔧 To bypass this check (NOT RECOMMENDED), use: git commit --no-verify'
    );

    process.exit(1);
  } else {
    console.log('✅ No potential credentials detected.');
    process.exit(0);
  }
}

// Run main function if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scanFileForCredentials, CREDENTIAL_PATTERNS };

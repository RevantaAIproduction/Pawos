import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import type { ProjectContext } from '../../shared/actions/ProjectTypes';

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.development', '.env.production', '.env.example'];
const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;
const PORT_PATTERN = /^\s*[A-Z_]*PORT[A-Z_]*\s*=\s*(\d{2,5})/im;

function readJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function firstExisting(root: string, names: string[]): string | null {
  for (const name of names) {
    if (fs.existsSync(path.join(root, name))) return name;
  }
  return null;
}

function detectFramework(pkg: Record<string, any> | null, root: string): string | null {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if (deps.next) return 'Next.js';
  if (deps.electron) return 'Electron';
  if (deps.express) return 'Express';
  if (deps['@nestjs/core']) return 'NestJS';
  if (deps.react) return 'React';
  if (deps.vue) return 'Vue';
  if (fs.existsSync(path.join(root, 'requirements.txt'))) {
    const text = fs.readFileSync(path.join(root, 'requirements.txt'), 'utf-8').toLowerCase();
    if (text.includes('fastapi')) return 'FastAPI';
    if (text.includes('django')) return 'Django';
    if (text.includes('flask')) return 'Flask';
  }
  const pomPath = path.join(root, 'pom.xml');
  if (fs.existsSync(pomPath)) {
    try {
      if (fs.readFileSync(pomPath, 'utf-8').includes('spring-boot')) return 'Spring Boot';
    } catch {
      // unreadable — fall through to "no framework detected"
    }
  }
  if (firstExisting(root, ['build.gradle', 'build.gradle.kts'])) {
    const gradleFile = path.join(root, firstExisting(root, ['build.gradle', 'build.gradle.kts']) ?? '');
    try {
      if (fs.readFileSync(gradleFile, 'utf-8').includes('spring-boot')) return 'Spring Boot';
    } catch {
      // unreadable — fall through
    }
  }
  return null;
}

function isJavaProject(root: string): boolean {
  return fs.existsSync(path.join(root, 'pom.xml')) || Boolean(firstExisting(root, ['build.gradle', 'build.gradle.kts']));
}

function detectLanguage(root: string): ProjectContext['language'] {
  if (isJavaProject(root)) return 'java';
  if (fs.existsSync(path.join(root, 'tsconfig.json'))) return 'typescript';
  if (fs.existsSync(path.join(root, 'package.json'))) return 'javascript';
  if (fs.existsSync(path.join(root, 'requirements.txt')) || fs.existsSync(path.join(root, 'pyproject.toml'))) return 'python';
  return 'unknown';
}

function detectPackageManager(root: string): ProjectContext['packageManager'] {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(root, 'requirements.txt')) || fs.existsSync(path.join(root, 'Pipfile'))) return 'pip';
  if (fs.existsSync(path.join(root, 'package.json'))) return 'npm';
  return 'unknown';
}

function detectBuildTool(root: string): string | null {
  if (firstExisting(root, ['next.config.js', 'next.config.mjs', 'next.config.ts'])) return 'Next.js';
  if (firstExisting(root, ['vite.config.js', 'vite.config.ts'])) return 'Vite';
  if (firstExisting(root, ['webpack.config.js', 'webpack.config.ts'])) return 'Webpack';
  return null;
}

function detectRuntime(pkg: Record<string, any> | null, root: string): string | null {
  if (pkg?.engines?.node) return `Node ${pkg.engines.node}`;
  const nvmrc = path.join(root, '.nvmrc');
  if (fs.existsSync(nvmrc)) return `Node ${fs.readFileSync(nvmrc, 'utf-8').trim()}`;
  const pyVersion = path.join(root, '.python-version');
  if (fs.existsSync(pyVersion)) return `Python ${fs.readFileSync(pyVersion, 'utf-8').trim()}`;
  return null;
}

function detectPorts(root: string): number[] {
  const ports = new Set<number>();
  for (const name of ENV_FILE_NAMES) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) continue;
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      for (const line of text.split('\n')) {
        const match = line.match(PORT_PATTERN);
        if (match) ports.add(Number(match[1]));
      }
    } catch {
      // unreadable — skip, this is a best-effort hint only
    }
  }
  return [...ports];
}

function detectHasTests(pkg: Record<string, any> | null, root: string): boolean {
  if (pkg?.scripts?.test) return true;
  if (fs.existsSync(path.join(root, '__tests__'))) return true;
  try {
    return fs.readdirSync(root).some((entry) => TEST_FILE_PATTERN.test(entry));
  } catch {
    return false;
  }
}

function detectGitRemote(root: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd: root, timeout: 5000 }, (error, stdout) => {
      resolve(error ? undefined : stdout.trim() || undefined);
    });
  });
}

/**
 * Pure filesystem inspection — never guesses project structure, only reports
 * what's actually on disk. The one exception is a single `git remote`
 * read (execFile, not a shell string). Env file *contents* are never read
 * (only existence), since they commonly hold secrets.
 */
export async function analyzeProject(root: string): Promise<ProjectContext> {
  const pkg = readJson(path.join(root, 'package.json'));
  const isGitRepo = fs.existsSync(path.join(root, '.git'));

  return {
    root,
    workspaceName: pkg?.name || path.basename(root),
    framework: detectFramework(pkg, root),
    language: detectLanguage(root),
    packageManager: detectPackageManager(root),
    buildTool: detectBuildTool(root),
    runtime: detectRuntime(pkg, root),
    scripts: pkg?.scripts ?? {},
    git: { isRepo: isGitRepo, remoteUrl: isGitRepo ? await detectGitRemote(root) : undefined },
    docker: Boolean(firstExisting(root, ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'])),
    ports: detectPorts(root),
    hasTests: detectHasTests(pkg, root),
    envFiles: ENV_FILE_NAMES.filter((name) => fs.existsSync(path.join(root, name))),
  };
}

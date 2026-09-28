import * as fs from 'fs';
import * as path from 'path';
import type { EvidenceAppKind, EvidenceProviderId } from '../../shared/evidence/EvidenceTypes';

const WEB_DEPS = ['next', 'vite', 'react-scripts', 'react-dom', 'vue', 'nuxt', '@angular/core', 'svelte', '@sveltejs/kit', 'astro', 'gatsby', 'remix', '@remix-run/react', 'solid-js'];
const DESKTOP_DEPS = ['electron', '@tauri-apps/api', '@tauri-apps/cli', 'nw', '@neutralinojs/lib'];
const MOBILE_DEPS = ['react-native', 'expo', '@capacitor/core', '@ionic/react', 'nativescript'];
const BACKEND_DEPS = ['express', 'fastify', 'koa', '@nestjs/core', 'hapi', '@hapi/hapi', 'apollo-server', 'graphql-yoga', 'bullmq', 'agenda'];

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function exists(root: string, ...parts: string[]): boolean {
  return fs.existsSync(path.join(root, ...parts));
}

function hasFileMatching(dir: string, pattern: RegExp, depth = 1): boolean {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (pattern.test(entry.name)) return true;
      if (depth > 0 && entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        if (hasFileMatching(path.join(dir, entry.name), pattern, depth - 1)) return true;
      }
    }
  } catch {
    // unreadable folder — nothing found
  }
  return false;
}

/**
 * What kind(s) of app a project folder is, from its real files — a project can be several (a React
 * Native app is Android + iOS; a Next.js app with API routes is web). Order = most likely first.
 */
export function detectAppKinds(projectFolder: string): EvidenceAppKind[] {
  const kinds = new Set<EvidenceAppKind>();
  const pkg = readJson(path.join(projectFolder, 'package.json'));
  const deps = pkg ? { ...(pkg.dependencies as Record<string, string> | undefined), ...(pkg.devDependencies as Record<string, string> | undefined) } : {};
  const has = (names: string[]) => names.some((name) => name in deps);

  if (has(MOBILE_DEPS)) {
    kinds.add('android');
    kinds.add('ios');
  }
  if (exists(projectFolder, 'pubspec.yaml')) {
    kinds.add('android');
    kinds.add('ios');
  }
  if (exists(projectFolder, 'android', 'build.gradle') || exists(projectFolder, 'android', 'build.gradle.kts') || exists(projectFolder, 'app', 'src', 'main', 'AndroidManifest.xml')) kinds.add('android');
  if (exists(projectFolder, 'ios') || hasFileMatching(projectFolder, /\.(xcodeproj|xcworkspace)$/)) kinds.add('ios');

  if (has(DESKTOP_DEPS) || exists(projectFolder, 'src-tauri')) kinds.add('desktop');
  if (hasFileMatching(projectFolder, /\.(csproj|vbproj)$/) && hasFileMatching(projectFolder, /\.xaml$/, 2)) kinds.add('desktop');
  if (exists(projectFolder, 'CMakeLists.txt') && hasFileMatching(projectFolder, /\.(ui|qml)$/, 2)) kinds.add('desktop');

  if (has(WEB_DEPS) || exists(projectFolder, 'index.html') || exists(projectFolder, 'public', 'index.html')) kinds.add('web');

  const pythonDeps = [path.join(projectFolder, 'requirements.txt'), path.join(projectFolder, 'pyproject.toml')]
    .map((file) => {
      try {
        return fs.readFileSync(file, 'utf8').toLowerCase();
      } catch {
        return '';
      }
    })
    .join('\n');
  if (/\b(django|flask|fastapi|starlette|celery)\b/.test(pythonDeps) && !kinds.has('web')) kinds.add('backend');
  if (/\b(django|flask)\b/.test(pythonDeps) && exists(projectFolder, 'templates')) kinds.add('web');
  if (has(BACKEND_DEPS) || exists(projectFolder, 'go.mod') || exists(projectFolder, 'Cargo.toml') || exists(projectFolder, 'pom.xml') || exists(projectFolder, 'build.gradle')) {
    if (!kinds.has('android')) kinds.add('backend');
  }
  if (kinds.size === 0 && (pkg || pythonDeps)) kinds.add('backend');
  return [...kinds];
}

/** The capture provider for each app kind. */
export const PROVIDER_FOR_APP_KIND: Record<EvidenceAppKind, EvidenceProviderId> = {
  web: 'web',
  desktop: 'desktopWindow',
  android: 'android',
  ios: 'iosSimulator',
  backend: 'output',
};

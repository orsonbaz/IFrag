#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { port: undefined, dataDir: undefined, noOpen: false, reset: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--data-dir') out.dataDir = argv[++i];
    else if (a === '--no-open') out.noOpen = true;
    else if (a === '--reset') out.reset = true;
    else if (a === '-h' || a === '--help') {
      console.log(
        `IFrag — local fragrance formulation tool with live IFRA compliance\n\n` +
          `Usage: ifrag [options]\n\n` +
          `  --port <n>        port to listen on (default: 4173 or next free)\n` +
          `  --data-dir <p>    data directory (default: ~/.ifrag)\n` +
          `  --no-open         don't auto-open the browser\n` +
          `  --reset           wipe the database (with confirmation)\n` +
          `  -h, --help        show this help\n`
      );
      process.exit(0);
    }
  }
  return out;
}

async function confirm(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((res) => rl.question(prompt, res));
  rl.close();
  return String(ans).trim().toLowerCase() === 'yes';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = args.dataDir ? resolve(args.dataDir) : join(homedir(), '.ifrag');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  if (args.reset) {
    const dbFile = join(dataDir, 'ifrag.db');
    if (existsSync(dbFile)) {
      const ok = await confirm(`This will DELETE ${dbFile}. Type 'yes' to confirm: `);
      if (!ok) {
        console.log('Aborted.');
        process.exit(1);
      }
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        rmSync(dbFile + suffix, { force: true });
      }
      console.log('Database reset.');
    }
  }

  const getPort = (await import('get-port')).default;
  const port = args.port ?? (await getPort({ port: [4173, 4174, 4175, 4176, 4177] }));

  const repoRoot = resolve(__dirname, '..');
  const buildEntry = join(repoRoot, 'build', 'index.js');
  if (!existsSync(buildEntry)) {
    console.error(
      `\nError: ${buildEntry} not found.\n` +
        `Build the app first:\n  npm install && npm run build\n`
    );
    process.exit(1);
  }

  console.log(`\n  IFrag`);
  console.log(`  Data directory:  ${dataDir}`);
  console.log(`  Database:        ${join(dataDir, 'ifrag.db')}`);

  const child = spawn(process.execPath, [buildEntry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      IFRAG_HOME: dataDir,
      IFRAG_REPO_ROOT: repoRoot
    }
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`  Server:          ${url}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);

  if (!args.noOpen) {
    setTimeout(async () => {
      try {
        const { default: open } = await import('open');
        await open(url);
      } catch (err) {
        console.warn(`Could not auto-open browser: ${err.message}`);
      }
    }, 800);
  }

  child.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

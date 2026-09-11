import { spawn } from 'node:child_process';

const proxyUrl = process.env.AGENTRIA_NODE_PROXY_URL || 'http://127.0.0.1:3101';
const childEnvironment = { ...process.env, AGENTRIA_NODE_PROXY_URL: proxyUrl };

const proxy = spawn(process.execPath, ['scripts/agentria-proxy.mjs'], {
  cwd: process.cwd(),
  env: childEnvironment,
  stdio: 'inherit',
});

const packageRunner = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const web = spawn(packageRunner, ['exec', 'vinext', 'dev'], {
  cwd: process.cwd(),
  env: childEnvironment,
  stdio: 'inherit',
});

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  proxy.kill('SIGTERM');
  web.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 100);
}

proxy.on('exit', (code) => {
  if (!stopping) stop(code ?? 1);
});

web.on('exit', (code) => {
  if (!stopping) stop(code ?? 0);
});

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

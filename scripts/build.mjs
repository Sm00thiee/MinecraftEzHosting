import { spawn } from 'child_process';
import { platform } from 'process';

const isWindows = platform === 'win32';

const script = isWindows ? 'cmd.exe' : 'bash';
const args = isWindows
  ? ['/c', 'scripts\\build-docker-image.bat']
  : ['scripts/build-docker-image.sh'];

const child = spawn(script, args, { stdio: 'inherit' });

child.on('close', code => {
  if (code !== 0) {
    console.error(`Build script exited with code ${code}`);
    process.exit(1);
  }
});

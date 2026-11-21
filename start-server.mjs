import { createServer } from 'vite';

async function start() {
  const server = await createServer({
    configFile: './vite.config.ts',
  });
  await server.listen();
  server.printUrls();
  
  // Keep process alive indefinitely
  process.stdin.resume();
  setInterval(() => {}, 60000);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

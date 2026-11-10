// Runs the API against a throwaway in-memory MongoDB, seeded with demo data.
// Handy when Docker isn't available. Data is gone when you stop it.
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
const env = { ...process.env, MONGO_URI: mongo.getUri('vendora') };

const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${args[0]} exited with ${code}`)),
    );
  });

await run(['scripts/seed.js']);
const server = spawn(process.execPath, ['src/server.js'], { env, stdio: 'inherit' });

const stop = async () => {
  server.kill();
  await mongo.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

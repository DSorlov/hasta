#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { getConfig, formatError } from '../lib/utils.js';
import { runHastaServer } from '../lib/hasta.js';

const { argv } = yargs(hideBin(process.argv))
  .usage('Usage: $0 --configPath ./config.json')
  .help()
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    type: 'string',
  });

const handleError = (error) => {
  const text = error || 'Unknown Error';
  process.stdout.write(`\n${formatError(text)}\n`);
  console.error(error);
  process.exit(1);
};

const setupServer = async () => {
  const config = await getConfig(argv.configPath ? argv.configPath : '');
  await runHastaServer(config);
};

process.on('SIGTERM', async() => {
  console.log('[SIGERTM] HASTA terminating');
  process.exit();
});

process.on('SIGINT', async() => {
  console.log('[SIGINT] HASTA terminating');
  process.exit();
});

process.on('uncaughtException', (e) => {
  console.log('[UncaughtException] HASTA will be terminated: ', e.stack);
  process.exit();
});

setupServer().catch(handleError);

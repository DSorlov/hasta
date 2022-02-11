import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import untildify from 'untildify';

/*
 * Attempt to parse any config JSON file and read values from CLI.
 */
export async function getConfig(argv) {
  let config;

  if (argv.configPath) {
    // If a `configPath` is specified, try to read it and throw error if it doesn't exist
    try {
      const data = await readFile(
        path.resolve(untildify(argv.configPath)),
        'utf8'
      ).catch((error) => {
        console.error(
          new Error(
            `Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option.`
          )
        );
        throw error;
      });
      config = Object.assign(JSON.parse(data), argv);
    } catch (error) {
      console.error(
        new Error(
          `Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`
        )
      );
      throw error;
    }
  } else if (existsSync(path.resolve('./config.json'))) {
    // Else if `config.json` exists, use config values read from it
    try {
      const data = await readFile(path.resolve('./config.json'), 'utf8');
      config = Object.assign(JSON.parse(data), argv);
      console.log('Using configuration from ./config.json');
    } catch (error) {
      console.error(
        new Error(
          'Cannot parse configuration file at `./config.json`. Check to ensure that it is valid JSON.'
        )
      );
      throw error;
    }
  }

  return config;
}

import { clearLine, cursorTo } from 'node:readline';
import PrettyError from 'pretty-error';
import { noop } from 'lodash-es';
import chalk from 'chalk';

const pe = new PrettyError();
pe.start();

/*
 * Returns a log function based on config settings
 */
export function log(config) {
  if (config.verbose === false) {
    return noop;
  }

  if (config.logFunction) {
    return config.logFunction;
  }

  return (text, overwrite) => {
    if (overwrite === true && process.stdout.isTTY) {
      clearLine(process.stdout, 0);
      cursorTo(process.stdout, 0);
    } else {
      process.stdout.write('\n');
    }

    process.stdout.write(text);
  };
}

/*
 * Returns an warning log function based on config settings
 */
export function logWarning(config) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text) => {
    process.stdout.write(`\n${formatWarning(text)}\n`);
  };
}

/*
 * Returns an error log function based on config settings
 */
export function logError(config) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text) => {
    process.stdout.write(`\n${formatError(text)}\n`);
  };
}

/*
 * Format console warning text
 */
export function formatWarning(text) {
  return `${chalk.yellow.underline('Warning')}${chalk.yellow(
    ':'
  )} ${chalk.yellow(text)}`;
}

/*
 * Format console error text
 */
export function formatError(error) {
  const message = error instanceof Error ? error.message : error;
  return `${chalk.red.underline('Error')}${chalk.red(':')} ${chalk.red(
    message.replace('Error: ', '')
  )}`;
}

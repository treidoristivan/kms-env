#!/usr/bin/env node

'use strict';
const pkg = require('../package.json');
const path = require('path');
const assert = require('assert-plus');
const program = require('commander');
const chalk = require('chalk');
const KMSEnv = require('../lib').KMSEnv;
const fs = require('../lib/file.utils');

const showHelp = () => {
  program.outputHelp(chalk.blue);
};

function exitIfFailed(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  try {
    return fn.apply(null, args);
  } catch (err) {
    console.error(chalk.red(err.message));
    showHelp();
    process.exit(1);
  }
}

const exitOnFailedPromise = (promise) => promise.catch(err => {
  console.error(chalk.red(err.message));
  showHelp();
  process.exit(1);
});

const getOptions = (options) => {
  const accessKey = options.accessKeyId;
  const secretKey = options.secretAccessKey;
  const region = options.region;

  return {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    region,
    profile: options.profile
  };
};

const createClient = (program) => {
  const options = exitIfFailed(getOptions, program);

  const config = {
    apiVersion: '2014-11-01',
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    region: options.region
  };

  if (options.profile) {
    // configure the AWS profile if they specified it via options
    process.env.AWS_PROFILE = options.profile;
  }

  // need to load the AWS sdk after we set the process env for AWS_PROFILE
  const AWS = require('aws-sdk');
  const client = new AWS.KMS(config);
  return KMSEnv.create(client, fs);
};

const runInit = (client, keyId, file) => {

  const validate = () => {
    assert.string(keyId, 'Must provide keyId');
    assert.string(file, 'Must provide file');
  };
  exitIfFailed(validate);
  return exitIfFailed(client.init, keyId, path.resolve(file));
};

const runAdd = (client, file, entries) => {

  const validate = () => {
    assert.string(file, 'Must provide file');
    assert.bool(Array.isArray(entries), 'Must provide entries to encrypt');
  };
  exitIfFailed(validate);
  return exitIfFailed(client.add, path.resolve(file), entries);
};

const runDecrypt = (client) => {
  return exitIfFailed(client.decrypt, process.env).then(console.log);
};

const runShow = (client, file) => {
  const validate = () => {
    assert.string(file, 'Must provide file to show');
  };
  exitIfFailed(validate);
  return exitIfFailed(client.show, path.resolve(file)).then(console.log);
};

program
  .version(pkg.version)
  .option('-k, --access-key-id <id>', 'AWS Access key ID. Env: $AWS_ACCESS_KEY_ID')
  .option('-s, --secret-access-key <secret>', 'AWS Secret Access Key. Env: $AWS_SECRET_ACCESS_KEY')
  .option('-r, --region <region>', 'AWS Region. Env: $AWS_REGION')
  .option('-p, --profile <name>', 'AWS Credential profile to use');

program
  .command('init [keyId] [file]')
  .description('Initialize an environment variable file with provided CMK Id')
  .action((keyId, file) => {
    const client = createClient(program);
    exitOnFailedPromise(runInit(client, keyId, file));
  });

program
  .command('add [file] [entries...]')
  .description('Adds environment variable to file after encrypting the value')
  .action((file, entries) => {
    const client = createClient(program);
    exitOnFailedPromise(runAdd(client, file, entries));
  });

program
  .command('decrypt')
  .description(
    'Decrypts secure environment variables and generates a bash export for each. ' + 'Can be used with bash eval command to do in place decryption of env variables')
  .action(() => {
    const client = createClient(program);
    exitOnFailedPromise(runDecrypt(client));
  });

program
  .command('show [file]')
  .description('Show the contents of the env file decrypting all secure vars. Warning: Only use for debugging!')
  .action(file => {
    const client = createClient(program);
    exitOnFailedPromise(runShow(client, file));
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  showHelp();
}

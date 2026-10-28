import pino from 'pino';
import config from '../config.js';

const pretty = config.env === 'development' && process.stdout.isTTY;

const logger = pino({
  level: process.env.LOG_LEVEL || (config.env === 'test' ? 'silent' : 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(pretty && { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } } }),
});

export default logger;

/**
 * Logger configuration for Cartaisy Backend
 */

export const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'json',
  enableConsole: process.env.ENABLE_CONSOLE_LOG !== 'false',
  enableFile: process.env.ENABLE_FILE_LOG === 'true',
  filePath: process.env.LOG_FILE_PATH || './logs/app.log',
  maxFileSize: process.env.LOG_MAX_FILE_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  enableErrorFile: process.env.ENABLE_ERROR_FILE === 'true',
  errorFilePath: process.env.ERROR_LOG_FILE_PATH || './logs/error.log'
};

export default loggerConfig;
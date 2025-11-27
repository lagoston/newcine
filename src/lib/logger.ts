const isProduction = import.meta.env.PROD;

export const logger = {
  log: (...args: any[]) => {
    if (!isProduction) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (!isProduction) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    console.error(...args);
  },
  info: (...args: any[]) => {
    if (!isProduction) {
      console.info(...args);
    }
  }
};

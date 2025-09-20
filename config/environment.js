/**
 * Environment configuration and validation
 */
export class EnvironmentValidator {
  static validate() {
    console.log(new Date().toISOString(), `[ENV_CHECK] Attempting to log PUBLIC_KEY from environment validator.`);
    const publicKeyFromEnv = process.env.PUBLIC_KEY;
    console.log(new Date().toISOString(), `[ENV_CHECK] Raw process.env.PUBLIC_KEY: "${publicKeyFromEnv}"`);
    
    if (publicKeyFromEnv && typeof publicKeyFromEnv === 'string' && publicKeyFromEnv.length > 0) {
      console.log(new Date().toISOString(), `[ENV_CHECK] PUBLIC_KEY appears to be loaded. Length: ${publicKeyFromEnv.length}`);
      return true;
    } else {
      console.error(new Date().toISOString(), `[ENV_CHECK] CRITICAL ERROR: PUBLIC_KEY IS UNDEFINED, EMPTY, or not a string.`);
      console.error(new Date().toISOString(), `[ENV_CHECK] Please ensure 'dotenv/config' is the first import and PUBLIC_KEY is correctly set in your .env file.`);
      return false;
    }
  }

  static getPort() {
    return process.env.PORT || 3000;
  }

  static getPublicKey() {
    return process.env.PUBLIC_KEY;
  }
}

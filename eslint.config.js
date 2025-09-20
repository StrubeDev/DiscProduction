// eslint.config.js
import eslintJs from "@eslint/js"; // Using a more descriptive alias
import globals from "globals";
// defineConfig is optional here if you're comfortable without the type hints for the array itself,
// but it's fine to keep if you like it.
// import { defineConfig } from "eslint/config";

export default /*defineConfig*/([ // defineConfig is optional
  // Apply ESLint's recommended JavaScript rules to all .js, .mjs, .cjs files.
  eslintJs.configs.recommended,

  // Configuration object for your project specifics
  {
    files: ["**/*.{js,mjs,cjs}"], // You can specify files again if needed, or this can apply globally if not overriding
    languageOptions: {
      ecmaVersion: "latest", // Specify the ECMAScript version
      sourceType: "module",  // You are using ES modules
      globals: {
        ...globals.node,    // Use Node.js global variables
        // You can add other custom global variables your project might have:
        // "myCustomGlobal": "readonly",
      }
    },
    // --- THIS IS THE SECTION THAT WAS ADDED/MODIFIED ---
    rules: {
      "no-unused-vars": ["warn", { // Or "error" if you prefer it to be an error
        "argsIgnorePattern": "^_",    // Ignore arguments that start with an underscore
        "varsIgnorePattern": "^_",    // Optionally ignore regular variables that start with an underscore
        "caughtErrorsIgnorePattern": "^_" // Optionally ignore caught error variables that start with an underscore
      }],
      // You can add other custom rules or override recommended ones here:
      // "no-console": "warn", // Example: warn about console.log statements
      // "semi": ["error", "always"]
    }
    // --- END OF ADDED/MODIFIED SECTION ---
  },
  // You can add more specific configuration objects, e.g., for test files
  // {
  //   files: ["test/**/*.js"],
  //   languageOptions: {
  //     globals: {
  //       ...globals.node,
  //       ...globals.mocha, // or jest, etc.
  //     }
  //   },
  //   rules: {
  //     // rules specific to tests
  //   }
  // }
]);

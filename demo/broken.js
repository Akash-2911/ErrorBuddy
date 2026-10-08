// @ts-check
// ErrorBuddy demo file. Five planted errors, fixed top to bottom during the demo.
// (`@ts-check` makes VS Code report type errors in plain JavaScript.)

// 1. Undefined variable. Fix: change `userNmae` to `userName`.
const userName = 'Ada';
console.log('Welcome back, ' + userNmae);

// 2. Missing bracket. Fix: add the closing `]`.
const scores = [90, 85, 77;
console.log(scores.length);

// 3. Missing semicolon-style syntax error. Fix: add the `+` (or a `;`) between the two values.
const total = 10 20;
console.log(total);

// 4. Calling something that isn't a function. Fix: remove the `()` after `maxLives`.
const maxLives = 3;
console.log(maxLives());

// 5. The legendary one: the settings don't match the type they promise. Fix: make `port` and `retries` numbers.
const settings = {
  server: { host: 'localhost', port: '8080', retries: 'three' },
  features: { darkMode: true, beta: false },
};
/** @type {{ server: { host: string, port: number, retries: number }, features: { darkMode: boolean, beta: boolean } }} */
const appConfig = settings;
console.log(appConfig.server.host);

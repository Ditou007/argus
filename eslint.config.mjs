// Root ESLint flat config. keel's generated rules are spread in first; add yours after.
import keel from "./eslint.config.keel.mjs";

export default [
  ...keel,
  // your project rules here
];

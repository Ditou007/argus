// Root ESLint flat config. keel's generated rules are spread in first; add yours after.
import keel from "./eslint.config.keel.mjs";
import tseslint from "typescript-eslint";

export default [
  ...keel,
  // Parse TypeScript so keel's complexity/size rules apply to .ts/.tsx files.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
  },
];

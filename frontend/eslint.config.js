import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { window: "readonly", document: "readonly", navigator: "readonly" },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      // Accessibility rules
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/heading-has-content": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
    },
  },
  // WS-B (Forge OS generative UI engine): generated surfaces are data, never
  // code. No raw HTML sinks and no string-to-code paths anywhere under genui.
  {
    files: ["src/os/genui/**/*.{ts,tsx}"],
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "Generated UI must never inject HTML (no dangerouslySetInnerHTML in src/os/genui).",
        },
        {
          selector: "Property[key.name='dangerouslySetInnerHTML']",
          message: "Generated UI must never inject HTML (no dangerouslySetInnerHTML in src/os/genui).",
        },
        { selector: "CallExpression[callee.name='eval']", message: "eval is forbidden in src/os/genui." },
        { selector: "MemberExpression[property.name='eval']", message: "eval is forbidden in src/os/genui." },
        { selector: "NewExpression[callee.name='Function']", message: "new Function is forbidden in src/os/genui." },
        { selector: "CallExpression[callee.name='Function']", message: "Function() is forbidden in src/os/genui." },
        {
          selector: "MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML|srcdoc)$/]",
          message: "Raw HTML sinks are forbidden in src/os/genui (MCP App HTML goes only through MCPAppFrame).",
        },
        {
          selector: "MemberExpression[object.name='document'][property.name=/^(write|writeln)$/]",
          message: "document.write is forbidden in src/os/genui.",
        },
      ],
    },
  }
);

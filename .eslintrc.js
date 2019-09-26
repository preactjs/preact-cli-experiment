module.exports = {
	parser: "@typescript-eslint/parser",
	extends: ["plugin:@typescript-eslint/recommended", "prettier", "plugin:ava/recommended"],
	plugins: ["@typescript-eslint", "prettier", "ava"],
	parserOptions: {
		ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
		ecmaFeatures: { jsx: true },
		sourceType: "module" // Allows for the use of imports
	},
	rules: {
		"prettier/prettier": "warn",
		"@typescript-eslint/explicit-function-return-type": "off",
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/no-explicit-any": "off",
	}
};

import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from './eslint-function-contracts.js';

const tester = new RuleTester({ languageOptions: { parser: tsParser } });
const good = '/**\n * Adds.\n * Precondition: a, b are numbers.\n * Postcondition: returns their sum.\n */\n';

tester.run('function-contracts', rule, {
  valid: [
    { code: good + 'function add(a, b) { return a + b; }' },
    { code: good + 'export const add = (a, b) => a + b;' },
    { code: good + 'export default function main() {}' },
    { code: 'class A {\n' + good + 'run() {}\n}' },
    { code: 'const o = {\n' + good + 'run: async () => {},\n};' },
    { code: '[1].map((x) => x + 1);' },
  ],
  invalid: [
    { code: 'function add(a, b) { return a + b; }', errors: [{ messageId: 'missing' }] },
    { code: '/** Adds. */\nfunction add() {}', errors: [{ messageId: 'missing' }] },
    { code: '/**\n * Precondition: x.\n * Postcondition: y.\n */\nfunction add() {}', errors: [{ messageId: 'missing' }] },
    { code: '/**\n * Adds.\n * Precondition:\n * Postcondition: y.\n */\nfunction add() {}', errors: [{ messageId: 'missing' }] },
    { code: 'export const add = () => 1;', errors: [{ messageId: 'missing' }] },
    { code: 'class A { run() {} }', errors: [{ messageId: 'missing' }] },
  ],
});

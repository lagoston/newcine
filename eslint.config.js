import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-use-before-define': 'error',
      // 18/11/2026 (Reborn, pacote): REGRA DOS ÍCONES. Ícone do lucide-react é
      // sempre importado pelo nome: `import { Star } from 'lucide-react'`. Assim
      // só os ícones usados entram no site (hoje ≈60 ícones, 31 KB num arquivo
      // só, o pedaço "icons"). `import * as Icons` ou o mapa `icons` trazem os
      // ~1.300 ícones da biblioteca (≈600 KB) para a abertura. Para escolher um
      // ícone por nome em tempo de execução, faça um mapa pequeno com os que
      // podem aparecer: `const ICONS = { star: Star, heart: Heart }`.
      // (`npm run check:size` também acusa o pedaço de ícones inchado.)
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'lucide-react', importNames: ['icons'], message: 'Importe cada ícone pelo nome (import { Star } from "lucide-react"): o mapa "icons" traz a biblioteca inteira para a abertura.' }] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "ImportDeclaration[source.value='lucide-react'] > ImportNamespaceSpecifier", message: 'Importe cada ícone pelo nome (import { Star } from "lucide-react"): "import * as" traz a biblioteca inteira para a abertura.' },
      ],
    },
  }
);
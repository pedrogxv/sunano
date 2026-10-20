import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/navigation",
              importNames: ["usePathname"],
              message:
                'Use `usePathname` de "@/lib/hooks/use-pathname": na regeração do ISR a Home chega ao servidor como "/index" e o texto derivado do caminho quebra a hidratação (React #418).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/hooks/use-pathname.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

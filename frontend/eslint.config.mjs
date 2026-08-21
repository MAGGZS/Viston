import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * As regras de acessibilidade que faltavam.
 *
 * O `eslint-config-next` já registra o plugin, mas liga só seis regras — todas
 * sobre atributos `aria` mal escritos. As que pegam o que de fato quebrou aqui
 * ficavam de fora: `<div onClick>` que o teclado não alcança, rótulo que não
 * aponta para campo nenhum, elemento com `role` interativo sem foco. São
 * exatamente as duas primeiras coisas que a revisão de acessibilidade apontou,
 * e o lint pega sozinho — deixar para a revisão é deixar para depois.
 *
 * Registrar o plugin de novo é erro de configuração ("Cannot redefine plugin"),
 * então o que entra aqui são as regras, não o preset.
 */
const a11yRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, level]) => [rule, level])
);

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      ...a11yRules,
      // `label-has-for` está obsoleto no próprio plugin: pede `htmlFor` mesmo
      // quando o campo está dentro do `<label>`, que é o desenho de metade dos
      // campos daqui. `label-has-associated-control` cobre o caso de verdade.
      "jsx-a11y/label-has-for": "off",
    },
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

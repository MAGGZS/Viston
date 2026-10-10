'use client';
import { BookOpen, Building2, ClipboardCheck, Eye, Rocket, Settings, ShieldCheck, Wrench } from 'lucide-react';

/**
 * O ícone de uma pasta, pelo nome que a API manda.
 *
 * A API devolve o nome de um componente do `lucide-react` (ver `icon` em
 * tutoriais/API.md). Um mapa fechado, e não `import * as icones`: importar o
 * pacote inteiro para escolher um por nome levaria os mil e tantos ícones para
 * o bundle desta tela. Os nomes aqui são os do mapa `PASTAS` do
 * tutoriais/scripts/catalogo.mjs; um nome novo que chegue sem entrar aqui cai
 * no livro, que é ícone genérico de ajuda, e a tela continua de pé.
 */
const ICONES = { Rocket, Building2, ClipboardCheck, Wrench, ShieldCheck, Eye, Settings };

export function IconeDaPasta({ nome, size = 20, ...props }) {
  const Icone = ICONES[nome] ?? BookOpen;
  return <Icone size={size} aria-hidden="true" {...props} />;
}

'use client';
import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { linkDaAjuda } from '@/app/lib/ajudaContexto';

/**
 * O "?" do cabeçalho: abre o tutorial da tela em que a pessoa está.
 *
 * Qual tutorial cada tela abre está em app/lib/ajudaContexto.js, num lugar só.
 * Aqui é só a peça: um link (é navegação, e não ação), redondo como os outros
 * botões de ícone do cabeçalho, com nome para o leitor de tela, porque o ponto
 * de interrogação sozinho não diz o que abre.
 *
 * `compacto` é a medida do computador (36px com mouse); no telefone o alvo
 * fica nos 44px do toque. Tela fora do mapa não desenha nada, em vez de um "?"
 * que levaria a lugar nenhum.
 */
export function BotaoAjuda({ contexto, compacto = false, style }) {
  const href = linkDaAjuda(contexto);
  if (!href) return null;

  return (
    <Link
      href={href}
      aria-label="Ajuda sobre esta tela"
      title="Ajuda sobre esta tela"
      className={`icone-btn icone-btn--chip${compacto ? ' icone-btn--compacto' : ''}`}
      style={style}
    >
      <CircleHelp size={compacto ? 17 : 19} aria-hidden="true" />
    </Link>
  );
}

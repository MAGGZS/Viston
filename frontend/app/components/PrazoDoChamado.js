'use client';
import { AlertTriangle } from 'lucide-react';
import { prazo, textoDoPrazo } from '@/app/lib/chamadosDoResponsavel';
import { T, W } from '@/app/lib/theme';

/**
 * O prazo do chamado em palavras, como quem executa o lê.
 *
 * Morava dentro do quadro do responsável, no computador. Saiu de lá quando o
 * telefone passou a mostrar o mesmo prazo, no cartão da lista e na tela do
 * chamado: o cálculo já descia pronto do servidor (`ticket.sla`) e o texto já
 * vinha de `textoDoPrazo`, mas a forma de dizer o atraso (vermelho, com o
 * triângulo e a palavra "Atrasado") tinha de ser uma só nos dois aparelhos.
 *
 * O atraso nunca vai só pela cor: a frase começa com "Atrasado há", e o
 * triângulo é decorativo (`aria-hidden`), porque o leitor de tela já ouviu a
 * notícia no texto.
 */
export function TextoDoPrazo({ ticket, size = 11, color, weight, style }) {
  const p = prazo(ticket);

  return (
    <span style={{
      color: p.atrasado ? T.danger : (color ?? T.faint),
      fontWeight: p.atrasado ? W.strong : weight,
      display: 'inline-flex', alignItems: 'center', gap: 4,
      ...style,
    }}>
      {p.atrasado && <AlertTriangle size={size} aria-hidden="true" style={{ flexShrink: 0 }} />}
      {textoDoPrazo(ticket)}
    </span>
  );
}

/**
 * O fio do prazo, no pé do cartão.
 *
 * Enche com o quanto do prazo já foi gasto: é o que mostra o chamado chegando
 * no limite antes de passar dele. O texto ao lado repete a notícia em palavras,
 * para ninguém depender da cor.
 */
export function FioDoPrazo({ ticket, fontSize = 11 }) {
  const p = prazo(ticket);
  if (p.dias === null || p.dias === undefined) return null;
  const cor = p.atrasado ? T.danger : p.em_risco ? T.accentInk : T.mute;
  const largura = `${Math.min(1, p.consumo) * 100}%`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div aria-hidden="true" style={{ flex: 1, height: 3, borderRadius: 999, background: T.chip, overflow: 'hidden' }}>
        <div style={{ width: largura, height: '100%', borderRadius: 999, background: cor }} />
      </div>
      <TextoDoPrazo ticket={ticket} size={fontSize} style={{ fontSize, whiteSpace: 'nowrap' }} />
    </div>
  );
}

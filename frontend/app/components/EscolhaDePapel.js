'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/app/components/ui';
import { T, R, W } from '@/app/lib/theme';

/**
 * O que cada papel faz no prédio, e em qual aparelho.
 *
 * O aparelho vem escrito porque foi ele o problema que trouxe esta tela: toda
 * aprovação entrava como visualizador, que só funciona no computador, e quem
 * tinha pedido acesso pelo celular era aprovado e não conseguia fazer nada. Com
 * o aparelho na frente do gestor, a escolha errada deixa de ser silenciosa.
 *
 * A ordem é a do trabalho no prédio: quem vistoria, quem atende, quem modera,
 * quem só acompanha. Gestor não está aqui: é outro tipo de conta, e entra pelo
 * e-mail na aba de colaboradores.
 */
export const PAPEIS_DE_APROVACAO = [
  {
    value: 'INSPECTOR',
    label: 'Inspetor',
    faz: 'Faz as vistorias andar por andar e registra as ocorrências.',
    aparelho: 'Pelo celular. A agenda também abre no computador.',
    Icone: Smartphone,
  },
  {
    value: 'RESPONSAVEL',
    label: 'Responsável',
    faz: 'Atende os chamados que o moderador encaminha e informa a conclusão.',
    aparelho: 'Pelo celular ou pelo computador.',
    Icone: Smartphone,
  },
  {
    value: 'MODERADOR',
    label: 'Moderador',
    faz: 'Recebe os chamados abertos nas vistorias, encaminha e fecha.',
    aparelho: 'Pelo computador, onde fica a fila de chamados.',
    Icone: Monitor,
  },
  {
    value: 'VIEWER',
    label: 'Visualizador',
    faz: 'Acompanha as vistorias e os relatórios do prédio, sem alterar nada.',
    aparelho: 'Somente pelo computador.',
    Icone: Monitor,
  },
];

/**
 * A escolha de papel ao aprovar um pedido de acesso.
 *
 * Nenhum papel vem marcado. Um padrão seria exatamente o defeito de antes com
 * outro nome: o gestor clicaria em "Aprovar" sem ler, e a pessoa entraria num
 * papel que ninguém escolheu. O botão de confirmar só acorda depois da escolha.
 *
 * `capacity` é o `role_capacity` da lista de membros: o papel que o plano do
 * prédio não comporta aparece desabilitado, com o motivo escrito à vista, antes
 * de qualquer clique. O motivo é a mesma frase que o servidor devolveria no
 * 403, porque sai da mesma regra (ver `planGate.roleCapacity` no backend). Sem
 * `capacity` (lista ainda carregando, ou falhou), tudo fica habilitado e quem
 * responde é o servidor.
 *
 * `error` é a frase do servidor quando a aprovação não passou; ela fica ligada
 * ao grupo por `aria-describedby`, para o leitor de tela anunciá-la junto.
 */
export function EscolhaDePapel({ request, capacity, pending = false, error = null, onConfirm, onBack }) {
  const [role, setRole] = useState(null);
  const baseId = useId();
  const legendId = `${baseId}-legenda`;
  const errorId = `${baseId}-erro`;
  const nome = request?.user?.name ?? 'esta pessoa';

  const escolhido = PAPEIS_DE_APROVACAO.find((p) => p.value === role);

  // Ao abrir, o foco vai para a primeira opção que dá para marcar: o botão
  // "Aprovar" que abriu esta escolha saiu da tela, e sem isso o foco cairia no
  // começo da página. Com tudo bloqueado, vai para a pergunta, que se lê.
  const formRef = useRef(null);
  const legendRef = useRef(null);
  useEffect(() => {
    const primeiro = formRef.current?.querySelector('input[type="radio"]:not(:disabled)');
    (primeiro ?? legendRef.current)?.focus();
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (!role || pending) return;
    onConfirm?.(role);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      {/*
        O anel de foco vai no cartão inteiro, e não no círculo do rádio: é o
        cartão que a pessoa lê como "a opção". `:has(:focus-visible)` mantém a
        regra do resto do produto, a de que clique de mouse não acende anel.
        A folha fica aqui, e não no globals.css, porque só esta tela a usa.

        O fundo mora todo na folha, e não no `style` do cartão: estilo inline
        vence qualquer `:hover`, e era por isso que o hover nunca aparecia. O
        hover mistura um pouco da cor do texto no chip em vez de trocar para o
        cartão, que no tema claro é o mesmo branco do modal e apagava a opção.
      */}
      <style>{`
        .papel-opcao {
          background: var(--color-chip);
          transition: background-color 160ms var(--ease-saida, ease-out), box-shadow 160ms var(--ease-saida, ease-out);
        }
        .papel-opcao[data-ativo='true'] {
          background: var(--color-accent-soft);
          box-shadow: inset 0 0 0 1px var(--accent-line);
        }
        .papel-opcao:has(input:focus-visible) { outline: 2px solid var(--color-accent-ink); outline-offset: 2px; }
        @media (hover: hover) and (pointer: fine) {
          .papel-opcao:not([data-disabled='true']):not([data-ativo='true']):hover {
            background: color-mix(in srgb, var(--color-chip), var(--color-ink) 7%);
          }
        }
      `}</style>

      <fieldset
        aria-describedby={error ? errorId : undefined}
        style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}
      >
        <legend id={legendId} ref={legendRef} tabIndex={-1} style={{ outline: 'none', color: T.text, fontSize: 14, lineHeight: 1.5, marginBottom: 12, padding: 0 }}>
          Qual será o papel de <strong style={{ fontWeight: W.strong }}>{nome}</strong> neste prédio?
        </legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PAPEIS_DE_APROVACAO.map(({ value, label, faz, aparelho, Icone }) => {
            const vaga = capacity?.[value];
            const bloqueado = vaga ? vaga.allowed === false : false;
            const ativo = role === value;
            const inputId = `${baseId}-${value}`;
            const descId = `${inputId}-desc`;
            const motivoId = `${inputId}-motivo`;
            const nomeId = `${inputId}-nome`;

            return (
              <label
                key={value}
                htmlFor={inputId}
                className="papel-opcao"
                data-disabled={bloqueado ? 'true' : 'false'}
                data-ativo={ativo ? 'true' : 'false'}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '12px 14px',
                  borderRadius: R.control,
                  cursor: bloqueado ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={`${baseId}-papel`}
                  value={value}
                  checked={ativo}
                  disabled={bloqueado || pending}
                  onChange={() => setRole(value)}
                  // O nome é só o papel; o que ele faz, o aparelho e o motivo do
                  // bloqueio vão na descrição. Sem isso o leitor de tela leria o
                  // cartão inteiro como nome, a cada seta.
                  aria-labelledby={nomeId}
                  aria-describedby={bloqueado ? `${descId} ${motivoId}` : descId}
                  style={{ marginTop: 3, accentColor: 'var(--color-accent)', flexShrink: 0 }}
                />
                {/*
                  Bloqueado, só o nome e a descrição descem para `faint` (4,6:1
                  sobre o chip no tema claro, 5,2:1 no escuro). O motivo fica no
                  vermelho cheio: é a frase que explica o bloqueio. A opacidade
                  no cartão inteiro apagava o motivo junto e o tirava de 4,5:1.
                */}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span id={nomeId} style={{ color: bloqueado ? T.faint : T.text, fontSize: 14, fontWeight: W.strong }}>{label}</span>
                  <span id={descId} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ color: bloqueado ? T.faint : T.mute, fontSize: 13, lineHeight: 1.45 }}>{faz}</span>
                    <span style={{ color: bloqueado ? T.faint : T.mute, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icone size={13} aria-hidden="true" />
                      {aparelho}
                    </span>
                  </span>
                  {bloqueado && (
                    <span id={motivoId} style={{ color: T.danger, fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>
                      {vaga.reason || 'O plano deste prédio não comporta este papel.'}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p id={errorId} role="alert" style={{ color: T.danger, fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row" style={{ marginTop: 18 }}>
        <Button variant="secondary" style={{ flex: 1 }} onClick={onBack} disabled={pending}>
          Voltar
        </Button>
        <Button
          type="submit"
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          disabled={!role}
          loading={pending}
        >
          <Check size={14} aria-hidden="true" />
          {escolhido ? `Aprovar como ${escolhido.label.toLowerCase()}` : 'Escolha um papel'}
        </Button>
      </div>
    </form>
  );
}

'use client';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { T, R } from '@/app/lib/theme';

/**
 * As quatro exigências da senha.
 *
 * Estas linhas são a cópia de `backend/src/utils/senhaForte.ts`, e é preciso que
 * continuem iguais: se as duas listas divergirem, a tela marca um item que o
 * servidor recusa, e a pessoa fica olhando quatro vistos verdes e um erro
 * vermelho sem entender qual regra furou.
 */
export const REGRAS = [
  { id: 'tamanho', texto: 'Pelo menos 8 caracteres', testa: (s) => s.length >= 8 },
  { id: 'maiuscula', texto: 'Uma letra maiúscula', testa: (s) => /[A-Z]/.test(s) },
  { id: 'numero', texto: 'Um número', testa: (s) => /\d/.test(s) },
  // Qualquer coisa que não seja letra, número ou espaço. Listar símbolos
  // permitidos recusaria acentos e pontuação de outros teclados sem motivo.
  { id: 'especial', texto: 'Um caractere especial', testa: (s) => /[^A-Za-z0-9\s]/.test(s) },
];

/**
 * Abre a lista enquanto o campo da senha está em uso, e a fecha ao sair dele.
 *
 * Em tela estreita não há espaço à direita e a lista cai por baixo do campo,
 * onde cobre a confirmação da senha — o campo que a pessoa vai usar logo em
 * seguida. Fechando no `blur`, ela sai do caminho sozinha, que é o que um
 * droplist faz.
 *
 * Espalhe `ancora` no invólucro do campo, não no `input`: o botão do olho mora
 * lá dentro, e o `relatedTarget` é o que impede a lista de piscar quando o foco
 * anda de um para o outro dentro do mesmo campo.
 */
export function useFocoSenha() {
  const [comFoco, setComFoco] = useState(false);
  return {
    aberta: comFoco,
    ancora: {
      onFocus: () => setComFoco(true),
      onBlur: (e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setComFoco(false);
      },
    },
  };
}

/** A senha cumpre as quatro? É o que o botão de enviar consulta. */
export function senhaValida(senha) {
  return REGRAS.every((r) => r.testa(senha));
}

const S = {
  // O posicionamento mora no `globals.css`, na classe `.senha-regras`: ele
  // precisa de media query, e estilo em atributo não tem como expressar uma.
  caixa: {
    background: T.card,
    border: `1px solid ${T.line}`,
    borderRadius: R.card,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  linha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: 1.4 },
  marca: { flexShrink: 0, display: 'flex', alignItems: 'center' },
};

/**
 * A lista que abre ao lado do campo quando a pessoa começa a digitar.
 *
 * Ela flutua, e não ocupa espaço no fluxo: inline, ela nascia entre a senha e a
 * confirmação e empurrava metade do formulário a cada vez que aparecia — o
 * botão de enviar pulava debaixo do dedo de quem estava prestes a tocá-lo.
 *
 * Fechada até o primeiro caractere: mostrar quatro exigências antes de alguém
 * tentar é receber a pessoa com uma lista de deveres. Depois do primeiro toque
 * ela vira o contrário — um placar do que já está feito.
 *
 * Ela não some quando tudo passa. Sumir no último acerto tira da tela justamente
 * a confirmação de que agora está certo, e o campo fica igual ao que estava
 * errado um caractere antes.
 *
 * `aria-live="polite"` porque quem usa leitor de tela precisa ouvir o item mudar
 * de estado enquanto digita — sem isso a lista existe só para quem enxerga.
 */
export function SenhaChecklist({ senha, aberta = true, id = 'senha-regras' }) {
  if (!aberta || !senha) return null;

  return (
    <div id={id} className="senha-regras" style={S.caixa} aria-live="polite">
      {REGRAS.map(({ id: regraId, texto, testa }) => {
        const ok = testa(senha);
        return (
          <div key={regraId} style={{ ...S.linha, color: ok ? T.text : T.mute }}>
            <span style={S.marca} aria-hidden="true">
              {ok ? (
                <Check size={14} color={T.success ?? '#4ADE80'} strokeWidth={3} />
              ) : (
                <X size={14} color={T.faint} strokeWidth={2.5} />
              )}
            </span>
            {/* O estado vai no texto, e não só na cor e no ícone: quem não
                distingue verde de cinza precisa da palavra. */}
            <span>
              {texto}
              <span className="so-leitor">{ok ? ' — cumprido' : ' — falta'}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

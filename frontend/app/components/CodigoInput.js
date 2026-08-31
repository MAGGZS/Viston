'use client';
import { T, R } from '@/app/lib/theme';

const S = {
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 12, fontWeight: 400, color: T.mute },
  input: {
    background: T.chip,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: R.control,
    padding: '14px 16px',
    color: T.text,
    // 24px e monoespaçada: seis dígitos são para conferir contra o e-mail, e
    // conferir num tamanho de corpo de texto é onde se troca 6 por 8.
    fontSize: 24,
    fontFamily: "'Courier New', Courier, monospace",
    letterSpacing: 10,
    textAlign: 'center',
    outline: 'none',
    width: '100%',
  },
};

/**
 * O campo dos seis dígitos.
 *
 * `inputMode="numeric"` abre o teclado numérico no celular — é lá que a maior
 * parte das pessoas vai ler o código e digitá-lo. `autoComplete="one-time-code"`
 * faz iOS e Android oferecerem o código direto da notificação do e-mail, sem a
 * pessoa trocar de aplicativo.
 *
 * O filtro tira tudo que não é dígito enquanto se digita: colar "123 456" do
 * e-mail é o gesto mais natural que existe aqui, e sem isto viraria erro de
 * validação por causa de um espaço.
 *
 * Sem `autoFocus`: roubar o foco no carregamento atropela quem navega por
 * teclado e faz o leitor de tela começar no meio da página, sem o título nem a
 * explicação de para que serve o campo. A regra `jsx-a11y/no-autofocus` do
 * projeto cobra isso.
 */
export function CodigoInput({ valor, aoMudar, erro, rotulo = 'Código de 6 dígitos' }) {
  return (
    <div style={S.campo}>
      <label htmlFor="codigo" style={S.rotulo}>{rotulo}</label>
      <input
        id="codigo"
        name="codigo"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        value={valor}
        onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? 'codigo-erro' : undefined}
        style={{ ...S.input, ...(erro ? { borderColor: 'rgba(248,113,113,0.5)' } : {}) }}
      />
      {erro && (
        <span id="codigo-erro" role="alert" style={{ fontSize: 12, color: T.danger }}>
          {erro}
        </span>
      )}
    </div>
  );
}

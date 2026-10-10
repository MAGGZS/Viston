'use client';
import { useCallback, useId, useRef, useState } from 'react';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button, Textarea } from '@/app/components/ui';
import { useHelpFeedback } from '@/app/hooks/useAjuda';
import { codigoDoErro, mensagemDoErro } from '@/app/lib/erros';
import { T, R, W } from '@/app/lib/theme';

/**
 * O "Isso ajudou?" no pé do tutorial. Uma resposta por conta e tutorial.
 *
 * Quem já respondeu (o `my_feedback` que a API devolve com a funcionalidade)
 * vê o agradecimento no lugar da pergunta, e não os dois botões de novo: a
 * pergunta repetida a cada visita ensina a ignorá-la, e o servidor recusaria a
 * segunda resposta com 409 de qualquer jeito.
 *
 * "Sim" vai na hora: não há o que acrescentar a um sim. "Não" abre um campo
 * opcional antes de enviar, porque o não sozinho diz que algo falhou e não o
 * quê, e é o "o quê" que o admin precisa para regravar o passo certo. O
 * comentário continua opcional: quem não quer escrever manda o não assim mesmo.
 *
 * O foco acompanha cada troca, porque o botão clicado some em todas elas: o
 * "Não" leva ao campo, o "Voltar" devolve ao "Não", e o envio leva ao
 * agradecimento. Sem isso o foco cairia no `body` e quem usa teclado ou leitor
 * de tela recomeçaria do topo da página.
 */
export function IssoAjudou({ feature }) {
  const enviar = useHelpFeedback(feature.slug);
  const [escrevendo, setEscrevendo] = useState(false);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState(null);
  const tituloId = useId();
  const erroId = useId();
  // Marcas de "o foco vai para lá quando aparecer". O agradecimento só pega o
  // foco depois de um envio feito agora: quem abre o tutorial já respondido não
  // deve ter o foco puxado para o pé da página.
  const focarNoNao = useRef(false);
  const focarNoObrigado = useRef(false);
  // O campo ganha o foco ao aparecer, porque foi o clique no "Não" que o abriu.
  // Ref estável, e não `autoFocus` nem função nova a cada render: esta última
  // devolveria o foco ao campo a cada tecla, mesmo com a pessoa já no botão.
  const focarAoAbrir = useCallback((el) => el?.focus(), []);

  const respondido = feature.my_feedback || enviar.isSuccess;

  const mandar = async (helpful) => {
    setErro(null);
    focarNoObrigado.current = true;
    try {
      await enviar.mutateAsync({ helpful, comment: comentario.trim() || undefined });
    } catch (e) {
      // Respondido em outra aba ou outro aparelho: para a pessoa, o resultado é
      // o mesmo de ter respondido agora.
      if (codigoDoErro(e) === 'JA_RESPONDIDO') return;
      focarNoObrigado.current = false;
      // Qualquer outra recusa mostra a frase do servidor, inclusive o 429 do
      // teto de respostas por conta ("Muitas respostas em sequência..."), que
      // diz quando tentar de novo melhor do que uma frase genérica diria.
      setErro(mensagemDoErro(e));
    }
  };

  const caixa = { background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: '16px 18px' };

  if (respondido || enviar.error?.response?.data?.error?.code === 'JA_RESPONDIDO') {
    return (
      <div
        role="status"
        tabIndex={-1}
        ref={(el) => {
          if (el && focarNoObrigado.current) {
            focarNoObrigado.current = false;
            el.focus();
          }
        }}
        style={{ ...caixa, display: 'flex', alignItems: 'center', gap: 10, outline: 'none' }}
      >
        <Check size={18} color={T.success} aria-hidden="true" style={{ flexShrink: 0 }} />
        <p style={{ color: T.text, fontSize: 14 }}>Obrigado pela resposta. Ela vai direto para quem cuida dos tutoriais.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby={tituloId} style={caixa}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 id={tituloId} style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>
          Isso ajudou?
        </h2>
        {!escrevendo && (
          <div role="group" aria-labelledby={tituloId} style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => mandar(true)}
              loading={enviar.isPending}
              aria-describedby={erro ? erroId : undefined}
              style={{ padding: '9px 16px' }}
            >
              <ThumbsUp size={15} aria-hidden="true" /> Sim
            </Button>
            <Button
              variant="secondary"
              ref={(el) => {
                if (el && focarNoNao.current) {
                  focarNoNao.current = false;
                  el.focus();
                }
              }}
              onClick={() => setEscrevendo(true)}
              disabled={enviar.isPending}
              style={{ padding: '9px 16px' }}
            >
              <ThumbsDown size={15} aria-hidden="true" /> Não
            </Button>
          </div>
        )}
      </div>

      {escrevendo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <Textarea
            label="O que faltou? (opcional)"
            rows={3}
            maxLength={2000}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            ref={focarAoAbrir}
            placeholder={
              feature.video_url
                ? 'Por exemplo: o vídeo passa rápido demais no passo 3.'
                : 'Por exemplo: o passo 3 não explica onde fica o botão.'
            }
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => {
                focarNoNao.current = true;
                setEscrevendo(false);
              }}
              disabled={enviar.isPending}
            >
              Voltar
            </Button>
            <Button
              onClick={() => mandar(false)}
              loading={enviar.isPending}
              aria-describedby={erro ? erroId : undefined}
            >
              Enviar resposta
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <p id={erroId} role="alert" style={{ color: T.danger, fontSize: 13, marginTop: 10 }}>{erro}</p>
      )}
    </section>
  );
}

'use client';
import { T, W } from '@/app/lib/theme';

/**
 * Foto do usuário, com a inicial do nome como recurso.
 *
 * A inicial não é um estado de erro: a maioria das contas nunca vai subir foto,
 * e um círculo dourado com a letra é o retrato padrão do produto.
 *
 * `<img>` puro, sem `next/image`: a foto já sobe recortada em 512px e aparece
 * entre 34 e 88px, então não há o que otimizar — e o `next/image` exigiria
 * cadastrar o host do storage na configuração do Next.
 */
export function Avatar({ user, size = 44, style = {}, className = '' }) {
  const initial = user?.name?.[0]?.toUpperCase();

  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: T.accent, color: T.onAccent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.display, fontWeight: W.title, fontSize: Math.round(size * 0.4),
        ...style,
      }}
    >
      {user?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt=""
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        initial
      )}
    </div>
  );
}

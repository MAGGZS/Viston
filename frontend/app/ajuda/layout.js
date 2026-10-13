import { AjudaShell } from '@/app/components/ajuda/AjudaShell';

// A central de ajuda é interna: exige sessão, e nunca deve aparecer em
// buscador. O `robots.txt` já bloqueia o prefixo (ver PRIVATE_ROUTE_PREFIXES em
// app/lib/site.js); o `noindex` aqui é a segunda trava, para o caso de algum
// rastreador chegar por um link colado em outro lugar.
export const metadata = {
  title: 'Ajuda e tutoriais',
  robots: { index: false, follow: false, nocache: true },
};

// A casca mora aqui, e não em cada página: no computador ela carrega a árvore
// das pastas, que precisa continuar montada (e como a pessoa a deixou) ao
// trocar de pasta ou de tutorial. Ver AjudaShell.
export default function AjudaLayout({ children }) {
  return <AjudaShell>{children}</AjudaShell>;
}

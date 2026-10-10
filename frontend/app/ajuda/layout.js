// A central de ajuda é interna: exige sessão, e nunca deve aparecer em
// buscador. O `robots.txt` já bloqueia o prefixo (ver PRIVATE_ROUTE_PREFIXES em
// app/lib/site.js); o `noindex` aqui é a segunda trava, para o caso de algum
// rastreador chegar por um link colado em outro lugar.
export const metadata = {
  title: 'Ajuda e tutoriais',
  robots: { index: false, follow: false, nocache: true },
};

export default function AjudaLayout({ children }) {
  return children;
}

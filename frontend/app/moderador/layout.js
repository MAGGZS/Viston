// Área do moderador: tudo exige sessão, nada é indexável.
export const metadata = {
  title: 'Chamados',
  robots: { index: false, follow: false, nocache: true },
};

export default function ModeradorLayout({ children }) {
  return children;
}

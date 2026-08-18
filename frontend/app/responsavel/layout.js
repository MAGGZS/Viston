// Tela do responsável: exige sessão, não é indexável.
export const metadata = {
  title: 'Meus chamados',
  robots: { index: false, follow: false, nocache: true },
};

export default function ResponsavelLayout({ children }) {
  return children;
}

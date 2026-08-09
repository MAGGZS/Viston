// Área de desktop (admin e visualização): tudo exige sessão, nada é indexável.
export const metadata = {
  title: 'Painel',
  robots: { index: false, follow: false, nocache: true },
};

export default function DesktopLayout({ children }) {
  return children;
}

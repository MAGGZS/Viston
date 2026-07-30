export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-primary px-4">
      {children}
    </div>
  );
}

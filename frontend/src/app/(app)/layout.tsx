import BottomNav from '@/components/ui/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg-primary pb-20 md:pb-0">
      {children}
      <BottomNav />
    </div>
  );
}

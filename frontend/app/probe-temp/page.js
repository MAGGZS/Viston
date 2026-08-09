'use client';
import { useAuthStore } from '@/app/store/auth';
import { RouteGuard } from '@/app/components/RouteGuard';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';

useAuthStore.setState({
  user: { id: 'probe', name: 'Probe', email: 'p@p.com', role: 'VIEWER' },
  isLoading: false,
});

function Inner() {
  const isDesktop = useIsDesktop();
  return (
    <div>
      <div id="probe-js" style={{ color: '#fff', padding: 20 }}>JS isDesktop = {String(isDesktop)}</div>
      <div id="probe-desktop" className="hidden lg:block" style={{ color: '#0f0', padding: 20 }}>LAYOUT DESKTOP</div>
      <div id="probe-mobile" className="lg:hidden" style={{ color: '#f00', padding: 20 }}>LAYOUT MOBILE</div>
    </div>
  );
}

export default function Probe() {
  return (
    <RouteGuard>
      <Inner />
    </RouteGuard>
  );
}

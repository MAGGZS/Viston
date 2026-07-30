import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login'];
const ADMIN_PATHS = ['/admin'];
const INSPECTOR_PATHS = ['/inspecao'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('accessToken')?.value;
  const role = request.cookies.get('userRole')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (ADMIN_PATHS.some((p) => pathname.startsWith(p)) && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  if (INSPECTOR_PATHS.some((p) => pathname.startsWith(p)) && role === 'VIEWER') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};

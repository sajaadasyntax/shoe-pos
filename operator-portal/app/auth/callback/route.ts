import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const destination = new URL('/', request.url);
  if (!code) {
    destination.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(destination);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    destination.searchParams.set('error', 'link_invalid_or_expired');
  }
  return NextResponse.redirect(destination);
}

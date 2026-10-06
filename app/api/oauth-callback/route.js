// TEMPORARY setup route for Google OAuth - DELETE after obtaining refresh token.
// Receives the OAuth code at https://kupa-poker.vercel.app/api/oauth-callback
// and exchanges it for tokens server-side.
import { NextResponse } from 'next/server';

const SETUP_KEY = 'f3dcc6c99258d56997a815a271e3d922';
const REDIRECT_URI = 'https://kupa-poker.vercel.app/api/oauth-callback';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get('key') !== SETUP_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return new NextResponse(
      `<!doctype html><html dir="rtl" lang="he"><body><h1>שגיאה באישור</h1><p>${error}</p></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (!code) {
    return new NextResponse(
      `<!doctype html><html dir="rtl" lang="he"><body><h1>לא התקבל קוד אישור</h1></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok || !tokens.refresh_token) {
      return new NextResponse(
        `<!doctype html><html dir="rtl" lang="he"><body><h1>שגיאה בהחלפת טוקן</h1><pre dir="ltr">${JSON.stringify(tokens, null, 2)}</pre></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Success - hand the refresh token to the operator (single setup use).
    return new NextResponse(
      `<!doctype html><html dir="rtl" lang="he"><body><h1>החיבור הצליח ✅</h1><p>העתק את ה-Refresh Token והגדר אותו ב-Vercel:</p><pre dir="ltr" style="background:#f0f0f0;padding:12px;word-break:break-all;">${tokens.refresh_token}</pre><p>לאחר ההגדרה — מחק את הנתיב הזמני הזה.</p></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } catch (e) {
    return new NextResponse(
      `<!doctype html><html dir="rtl" lang="he"><body><h1>שגיאת שרת</h1><pre dir="ltr">${String(e && e.message ? e.message : e)}</pre></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Browsers never reach this over plain HTTP (.app is on the HSTS preload
  // list), but scripts, crawlers and older clients can. Redirect before any
  // session cookie is read or written, so nothing sensitive travels in the
  // clear. 308 keeps the method, so a POST stays a POST.
  //
  // Decided on the scheme Cloudflare saw from the visitor, not on the URL the
  // app was handed: an adapter can rewrite that internally, and a redirect
  // keyed on it could loop forever. No header means no redirect.
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const secure = request.nextUrl.clone();
    secure.protocol = "https:";
    return NextResponse.redirect(secure, 308);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets, Next internals, and favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

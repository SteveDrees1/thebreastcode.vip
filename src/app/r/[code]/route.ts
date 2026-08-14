/**
 * Referral landing: /r/ABCD1234 stores the code in a cookie and drops the
 * visitor on the catalog. The cookie is redeemed when they finish signing up.
 */
import { NextResponse } from "next/server";
import { rememberReferralCode } from "@/lib/referrals";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (/^[A-Za-z0-9]{4,16}$/.test(code)) {
    await rememberReferralCode(code);
  }
  return NextResponse.redirect(new URL("/catalog?ref=1", req.url));
}

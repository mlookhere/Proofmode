import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ ok: true, service: "proofmode", time: new Date().toISOString() }); }

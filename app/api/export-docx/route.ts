import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildCopyDocx, type StrategyDocxInput } from "@/lib/docx-export";

export const runtime = "nodejs";
export const maxDuration = 60;

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "client"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const clientName: string = body?.clientName;
  const strategies: StrategyDocxInput[] = body?.strategies;
  if (!clientName || !Array.isArray(strategies) || !strategies.length) {
    return NextResponse.json(
      { error: "clientName and a non-empty strategies array are required." },
      { status: 400 },
    );
  }

  const buffer = await buildCopyDocx({
    clientName,
    website: body?.website,
    strategies,
    minIcpScore: body?.minIcpScore,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${slug(clientName)}-copy.docx"`,
    },
  });
}

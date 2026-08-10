import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `${file.name} is too large (max 15MB).` }, { status: 400 });
  }

  const ext = extOf(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    let text: string;
    if (ext === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text.trim();
      if (!text) {
        return NextResponse.json(
          { error: `${file.name} has no extractable text (likely an image-only or corrupted PDF).` },
          { status: 422 },
        );
      }
    } else if (ext === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value.trim();
    } else if (ext === "txt" || ext === "md" || ext === "markdown") {
      text = buffer.toString("utf8").trim();
    } else {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}". Use PDF, DOCX, TXT, or MD.` },
        { status: 400 },
      );
    }
    return NextResponse.json({ filename: file.name, text });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Could not read ${file.name}: ${err?.message ?? "unknown error"}` },
      { status: 422 },
    );
  }
}

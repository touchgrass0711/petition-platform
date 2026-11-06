import type { ReactNode } from "react";
import type { RichTextNode } from "@/lib/campaign";

// Server-rendered Tiptap JSON. Only these tags can come out; unknown nodes and marks render nothing,
// text goes through React's escaping, and links are re-checked here, so stored JSON can't inject markup.
const LINK = /^(https?:|mailto:)/i;

function marked(text: string, marks: RichTextNode["marks"] = []): ReactNode {
  return marks.reduce<ReactNode>((child, m) => {
    switch (m.type) {
      case "bold": return <strong>{child}</strong>;
      case "italic": return <em>{child}</em>;
      case "underline": return <u>{child}</u>;
      case "strike": return <s>{child}</s>;
      case "code": return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{child}</code>;
      case "link": {
        const href = String(m.attrs?.href ?? "");
        return LINK.test(href) ? (
          <a href={href} rel="noopener nofollow ugc" target="_blank" className="font-medium text-foreground underline underline-offset-4">
            {child}
          </a>
        ) : child;
      }
      default: return child;
    }
  }, text);
}

const HEADINGS = { 1: "h2", 2: "h2", 3: "h3", 4: "h4" } as const;

function render(n: RichTextNode, key: number): ReactNode {
  const kids = n.content?.map(render);
  switch (n.type) {
    case "doc": return <>{kids}</>;
    case "text": return <span key={key}>{marked(n.text ?? "", n.marks)}</span>;
    case "paragraph": return <p key={key}>{kids}</p>;
    case "heading": {
      const Tag = HEADINGS[n.attrs?.level as 1 | 2 | 3 | 4] ?? "h2";
      return <Tag key={key} className="pt-4 text-xl font-semibold tracking-tight text-foreground">{kids}</Tag>;
    }
    case "bulletList": return <ul key={key} className="list-disc space-y-1 pl-6">{kids}</ul>;
    case "orderedList": return <ol key={key} start={Number(n.attrs?.start) || 1} className="list-decimal space-y-1 pl-6">{kids}</ol>;
    case "listItem": return <li key={key}>{kids}</li>;
    case "blockquote": return <blockquote key={key} className="border-l-2 pl-4 italic">{kids}</blockquote>;
    case "codeBlock": return <pre key={key} className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm">{kids}</pre>;
    case "hardBreak": return <br key={key} />;
    case "horizontalRule": return <hr key={key} className="my-6" />;
    default: return null;
  }
}

export function RichText({ doc }: { doc: RichTextNode }) {
  return <div className="space-y-4 leading-7 text-pretty text-muted-foreground">{render(doc, 0)}</div>;
}

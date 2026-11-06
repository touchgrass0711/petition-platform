import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "./RichText";

const html = (content: unknown[]) => renderToStaticMarkup(<RichText doc={{ type: "doc", content } as never} />);
const linked = (href: string) => [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }] }];

describe("RichText", () => {
  it("escapes text and drops unknown nodes", () => {
    const out = html([
      { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
      { type: "image", attrs: { src: "x" } },
      { type: "iframe" },
    ]);
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toMatch(/<(script|img|iframe)/);
  });
  it("renders safe links with rel and drops unsafe ones", () => {
    expect(html(linked("https://example.com"))).toContain('href="https://example.com" rel="noopener nofollow ugc"');
    expect(html(linked("javascript:alert(1)"))).not.toContain("href");
  });
});

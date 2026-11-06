"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Underline, Undo2,
} from "lucide-react";
import type { RichTextNode } from "@/lib/campaign";
import { cn } from "@/lib/utils";

// Same protocols the server schema and the public renderer accept.
const SAFE_LINK = /^(https?:|mailto:)/i;

type Props = { value: RichTextNode; onChange: (doc: RichTextNode) => void; invalid?: boolean; labelledBy: string };

/** Tiptap StarterKit editor (admin only). Emits Tiptap JSON; the server validates it again before storing. */
export function RichTextEditor({ value, onChange, invalid, labelledBy }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", isAllowedUri: (url) => SAFE_LINK.test(url) },
      }),
    ],
    content: value,
    immediatelyRender: false, // avoids a hydration mismatch; the editor mounts on the client
    editorProps: {
      attributes: {
        "aria-labelledby": labelledBy,
        "aria-multiline": "true",
        role: "textbox",
        class: "min-h-48 px-3 py-2 outline-none [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_a]:underline space-y-3",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichTextNode),
  });
  return (
    <div className={cn("rounded-md border border-input dark:bg-input/30", invalid && "border-destructive")}>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render only when the active marks or nodes change, not on every keystroke.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link"),
      undo: e.can().undo(), redo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  function link() {
    if (s.link) return void chain().unsetLink().run();
    const href = window.prompt("Link address (https://… or mailto:…)")?.trim();
    if (href && SAFE_LINK.test(href)) chain().extendMarkRange("link").setLink({ href }).run();
  }
  const tools = [
    { label: "Heading", icon: Heading2, active: s.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: "Subheading", icon: Heading3, active: s.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    { label: "Bold", icon: Bold, active: s.bold, run: () => chain().toggleBold().run() },
    { label: "Italic", icon: Italic, active: s.italic, run: () => chain().toggleItalic().run() },
    { label: "Underline", icon: Underline, active: s.underline, run: () => chain().toggleUnderline().run() },
    { label: "Strikethrough", icon: Strikethrough, active: s.strike, run: () => chain().toggleStrike().run() },
    { label: "Bulleted list", icon: List, active: s.bullet, run: () => chain().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: s.ordered, run: () => chain().toggleOrderedList().run() },
    { label: "Quote", icon: Quote, active: s.quote, run: () => chain().toggleBlockquote().run() },
    { label: s.link ? "Remove link" : "Link", icon: Link2, active: s.link, run: link },
  ];
  const btn = "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 aria-pressed:bg-accent aria-pressed:text-foreground [&_svg]:size-4";
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b p-1">
      {tools.map(({ label, icon: Icon, active, run }) => (
        <button key={label} type="button" className={btn} aria-label={label} aria-pressed={active} onClick={run}>
          <Icon aria-hidden />
        </button>
      ))}
      <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
      <button type="button" className={btn} aria-label="Undo" disabled={!s.undo} onClick={() => chain().undo().run()}>
        <Undo2 aria-hidden />
      </button>
      <button type="button" className={btn} aria-label="Redo" disabled={!s.redo} onClick={() => chain().redo().run()}>
        <Redo2 aria-hidden />
      </button>
    </div>
  );
}

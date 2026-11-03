"use client";

import { Check, Link2, MessageCircle, Share, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { campaignFromPath, track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Adds campaign and channel tags so the dashboard can count visits that came from each share button. */
export function taggedUrl(url: string, channel: string) {
  const u = new URL(url);
  u.searchParams.set("utm_source", channel);
  u.searchParams.set("utm_medium", "share");
  const slug = campaignFromPath(u.pathname);
  if (slug) u.searchParams.set("utm_campaign", slug);
  return u.toString();
}

export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  // Detected after mount so server and client HTML match; mostly mobile, where Discord shows in the OS sheet.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const q = encodeURIComponent;
  const cls = cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full");

  // Discord has no share-intent URL; it builds the card from the page's OG tags when the link is pasted.
  const copy = () => {
    track("share_clicked", { channel: "copy" });
    return navigator.clipboard.writeText(`${text} ${taggedUrl(url, "copy")}`).then(
      () => {
        setCopied(true);
        toast("Link copied. Paste it in Discord or any chat.");
      },
      () => toast.error("Couldn't copy. Copy the address bar instead."),
    );
  };

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {canShare && (
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => (track("share_clicked", { channel: "native" }), navigator.share({ title: text, text, url: taggedUrl(url, "native") }).catch(() => {}))}>
          <Share aria-hidden /> Share
        </Button>
      )}
      <a className={cls} href={`https://wa.me/?text=${q(`${text} ${taggedUrl(url, "whatsapp")}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("share_clicked", { channel: "whatsapp" })}>
        <MessageCircle aria-hidden /> WhatsApp
      </a>
      <a
        className={cls}
        href={`https://x.com/intent/post?text=${q(text)}&url=${q(taggedUrl(url, "x"))}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("share_clicked", { channel: "x" })}
      >
        <Share2 aria-hidden /> Post on X
      </a>
      <Button variant="outline" size="sm" className="rounded-full" onClick={copy}>
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />} {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

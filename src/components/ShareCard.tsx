import { PartyPopper } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_MODE } from "@/lib/demo";
import { ShareButtons } from "./ShareButtons";

/** Replaces the sign form once this visitor has signed: one signature, then share. */
type Props = { title: string; url: string; alreadySigned?: boolean; menu?: ReactNode };

export function ShareCard({ title, url, alreadySigned = false, menu }: Props) {
  return (
    <Card className="relative shadow-lg">
      {menu && <div className="absolute top-4 right-4">{menu}</div>}
      <CardHeader className="items-center text-center">
        <PartyPopper className="mb-1 size-8" aria-hidden />
        <CardTitle className="text-xl">{alreadySigned ? "You have already signed this petition." : "Thanks for signing!"}</CardTitle>
        <CardDescription>
          {DEMO_MODE && !alreadySigned ? "Demo Mode: nothing was saved. " : ""}Now help it reach the goal by sharing it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ShareButtons url={url} text={`I signed: ${title}`} />
      </CardContent>
    </Card>
  );
}

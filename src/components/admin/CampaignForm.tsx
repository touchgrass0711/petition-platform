"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { adminApi } from "@/lib/admin-api";
import { RichText } from "@/components/RichText";
import { milestoneLadder, MILESTONES_MAX, type Campaign } from "@/lib/campaign";
import { fieldFor, slugify, soon, toFormValues, toInput, type CampaignFormValues } from "@/lib/campaign-form";
import { campaignInputSchema } from "@/lib/campaign-schema";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { confirmationsFor } from "@/lib/campaign-confirm";
import { useAdminSession } from "./AdminGate";
import { ConfirmDialog } from "./ConfirmDialog";

type Values = CampaignFormValues;

// The editor (ProseMirror) loads only when the form opens.
const RichTextEditor = dynamic(() => import("./RichTextEditor").then((m) => m.RichTextEditor), {
  ssr: false,
  loading: () => <div className="min-h-60 rounded-md border border-input" aria-hidden />,
});

// The same schema as the API, applied to the mapped values; issues land on the field that shows them.
const resolver: Resolver<Values> = async (values) => {
  const parsed = campaignInputSchema.safeParse(toInput(values));
  if (parsed.success) return { values, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of parsed.error.issues) {
    const key = fieldFor[String(issue.path[0])] ?? String(issue.path[0]);
    const message = issue.code === "invalid_format" && (key === "startDate" || key === "endDate") ? "Pick a date and a time" : issue.message;
    errors[key] ??= { type: "validate", message };
  }
  return { values: {}, errors: errors as FieldErrors<Values> };
};

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CampaignForm({ campaign }: { campaign: Campaign | null }) {
  const session = useAdminSession();
  const router = useRouter();
  const qc = useQueryClient();
  const editing = campaign !== null;
  const [slugTouched, setSlugTouched] = useState(editing);
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState<{ values: Values; reasons: string[] } | null>(null);
  const { register, handleSubmit, watch, setValue, control, formState } = useForm<Values>({
    resolver,
    defaultValues: toFormValues(campaign, browserZone()),
  });
  const milestones = useFieldArray({ control, name: "milestones" });
  const { errors, isSubmitting } = formState;
  const indefinitely = watch("indefinitely");

  // Publishing, or moving a live campaign's start, waits for a confirm dialog first.
  function onSubmit(values: Values) {
    const reasons = confirmationsFor(campaign, values);
    if (reasons.length) setPending({ values, reasons });
    else return save(values);
  }

  async function save(values: Values) {
    setPending(null);
    // Demo Mode: the form and dialogs work like the real thing, then stop before the API.
    if (DEMO_MODE) return void toast(DEMO_DISABLED_MESSAGE);
    try {
      const path = editing ? `/api/admin/campaigns/${campaign.slug}` : "/api/admin/campaigns";
      await adminApi(session, path, { method: editing ? "PUT" : "POST", body: JSON.stringify(toInput(values)) });
      toast.success(editing ? "Campaign saved" : "Campaign created");
      await qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      router.push("/admin/campaigns");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const error = (name: keyof Values) =>
    errors[name]?.message && (
      <p id={`${name}-error`} className="text-sm text-destructive">
        {String(errors[name]?.message)}
      </p>
    );
  const aria = (name: keyof Values) => ({ "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid max-w-3xl gap-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Campaign</CardTitle>
          <CardDescription>Shown on the campaign page, the landing page and link previews.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              {...aria("title")}
              {...register("title", {
                onChange: (e) => !slugTouched && setValue("slug", slugify(e.target.value)),
              })}
            />
            {error("title")}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Link</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/c/</span>
              <Input id="slug" readOnly={editing} {...aria("slug")} {...register("slug", { onChange: () => setSlugTouched(true) })} />
            </div>
            <p className="text-xs text-muted-foreground">
              {editing ? "The link can't change once created." : "Lowercase letters, digits and dashes. Fixed once created."}
            </p>
            {error("slug")}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input id="subtitle" {...aria("subtitle")} {...register("subtitle")} />
            {error("subtitle")}
          </div>
          <div className="grid gap-2 sm:max-w-48">
            <Label htmlFor="goal">Signature goal</Label>
            <Input id="goal" type="number" min={1} inputMode="numeric" {...aria("goal")} {...register("goal", { valueAsNumber: true })} />
            {error("goal")}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle id="description-label">Description</CardTitle>
          <CardDescription>Headings, emphasis, lists, quotes and links. Shown below the progress bar on the campaign page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <RichTextEditor value={field.value} onChange={field.onChange} invalid={Boolean(errors.description)} labelledBy="description-label" />
            )}
          />
          {error("description")}
          <Button variant="outline" size="sm" className="w-fit" aria-expanded={preview} onClick={() => setPreview((p) => !p)}>
            {preview ? "Hide preview" : "Preview"}
          </Button>
          {preview && (
            <div className="rounded-md border border-dashed p-4">
              <RichText doc={watch("description")} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Milestones</CardTitle>
          <CardDescription>Signature counts marked on the progress bar, lowest first, each at most the goal (up to {MILESTONES_MAX}).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {milestones.fields.length > 0 && (
            <ol className="grid gap-2">
              {milestones.fields.map((f, i) => (
                <li key={f.id} className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={`Milestone ${i + 1} signatures`}
                    className="w-32"
                    {...register(`milestones.${i}.count`, { valueAsNumber: true })}
                  />
                  <Input aria-label={`Milestone ${i + 1} label`} placeholder="Label (optional)" {...register(`milestones.${i}.label`)} />
                  <Button variant="ghost" size="icon" aria-label={`Remove milestone ${i + 1}`} onClick={() => milestones.remove(i)}>
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          {error("milestones")}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={milestones.fields.length >= MILESTONES_MAX}
              onClick={() => {
                const last = watch("milestones").at(-1)?.count ?? 0;
                milestones.append({ count: Math.min(last + 100, watch("goal") || last + 100), label: "" });
              }}
            >
              <Plus aria-hidden /> Add milestone
            </Button>
            <Button variant="outline" size="sm" onClick={() => milestones.replace(milestoneLadder(watch("goal") || 0))}>
              <Sparkles aria-hidden /> Generate up to goal
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Times are read in the campaign&apos;s time zone. Signing is open from the start until the end.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="timeZone">Time zone</Label>
            <Input id="timeZone" list="time-zones" autoComplete="off" {...aria("timeZone")} {...register("timeZone")} />
            <datalist id="time-zones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            {error("timeZone")}
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Start</legend>
            <div className="flex flex-wrap gap-2">
              <Input type="date" aria-label="Start date" className="w-auto" {...aria("startDate")} {...register("startDate")} />
              <Input type="time" aria-label="Start time" className="w-auto" {...register("startTime")} />
              <Button
                variant="outline"
                onClick={() => {
                  const now = soon(watch("timeZone"));
                  setValue("startDate", now.date);
                  setValue("startTime", now.time);
                }}
              >
                Today
              </Button>
            </div>
            {error("startDate")}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">End</legend>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" aria-label="End date" className="w-auto" disabled={indefinitely} {...aria("endDate")} {...register("endDate")} />
              <Input type="time" aria-label="End time" className="w-auto" disabled={indefinitely} {...register("endTime")} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" {...register("indefinitely")} />
                Indefinitely
              </label>
            </div>
            {error("endDate")}
          </fieldset>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>Drafts are hidden. Published campaigns show at once and open for signing at their start time.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {(["draft", "published"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="radio" value={s} className="size-4 accent-primary" {...register("status")} />
              {s === "draft" ? "Draft" : "Published"}
            </label>
          ))}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title={campaign?.status === "published" ? "Change the start of a live campaign?" : "Publish this campaign?"}
        confirmLabel={pending?.values.status === "published" && campaign?.status !== "published" ? "Publish" : "Save changes"}
        onConfirm={() => pending && save(pending.values)}
        onCancel={() => setPending(null)}
      >
        {pending?.reasons.map((r) => <p key={r}>{r}</p>)}
      </ConfirmDialog>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {editing ? "Save changes" : "Create campaign"}
        </Button>
        <Link href="/admin/campaigns" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

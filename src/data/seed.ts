import { milestoneLadder, type Campaign, type RichTextNode } from "@/lib/campaign";
import { docToText } from "@/lib/campaign-schema";
import type { Comment, Petition } from "@/lib/types";

export const seedPetition: Omit<Petition, "id"> = {
  title: "Campaign Title",
  description:
    "A short summary of what this campaign asks for, who it affects and why it matters. Replace this text with your own petition copy.",
  goal: 8000,
  signatureCount: 8452,
};

// [name, message, hours ago, pinned]
const rows: [string, string, number, boolean][] = [
  ["Campaign Team", "Thank you for every signature. We deliver the petition when we reach the goal.", 2, true],
  ["Maya R.", "Signed and shared with my family. This affects all of us.", 1, false],
  ["Daniel K.", "Long overdue. Glad someone finally organised this.", 3, false],
  ["Priya S.", "I've followed this issue for years. Count me in.", 5, false],
  ["Tom H.", "Sent this to my whole team at work.", 7, false],
  ["Lina M.", "Small changes like this make a real difference locally.", 9, false],
  ["Jonas W.", "Adding my name. Hope the decision makers are listening.", 12, false],
  ["Aisha B.", "This is exactly the kind of action our community needs.", 15, false],
  ["Marco D.", "Signed. Please keep us updated on the next steps.", 20, false],
  ["Sofia L.", "My neighbours and I all signed this morning.", 26, false],
  ["Ethan P.", "Clear ask, reasonable goal. Happy to support.", 31, false],
  ["Nadia F.", "Shared it in three group chats already.", 38, false],
  ["Kenji T.", "Hoping we get past ten thousand this week.", 44, false],
  ["Grace O.", "Thank you to the organisers for the clear updates.", 52, false],
  ["Lucas V.", "Signed on behalf of my parents too (they asked me to).", 60, false],
  ["Hana Y.", "This should have happened a long time ago.", 71, false],
  ["Omar A.", "Proud to add my voice.", 85, false],
  ["Elena G.", "Let's get this over the line!", 96, false],
];

export function seedComments(now = Date.now()): Omit<Comment, "id">[] {
  return rows.map(([name, message, hoursAgo, pinned]) => ({
    name,
    message,
    avatarUrl: null,
    pinned,
    createdAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  }));
}

const DAY = 86_400_000;
const text = (t: string) => ({ type: "text", text: t });
const paragraph = (t: string) => ({ type: "paragraph", content: [text(t)] });

const description: RichTextNode = {
  type: "doc",
  content: [
    paragraph("A short summary of what this campaign asks for, who it affects and why it matters."),
    { type: "heading", attrs: { level: 2 }, content: [text("What we are asking for")] },
    {
      type: "bulletList",
      content: ["First concrete ask", "Second concrete ask", "A date by which we expect an answer"].map((t) => ({
        type: "listItem",
        content: [paragraph(t)],
      })),
    },
    {
      type: "paragraph",
      content: [
        text("Replace this text with your own campaign copy. "),
        { type: "text", text: "Read the background", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        text("."),
      ],
    },
  ],
};

// [slug, title, subtitle, goal, count, start (days from now), end (days from now | null), featured, goal reached (days from now | null)]
type Row = [string, string, string, number, number, number, number | null, boolean, number | null];
const campaignRows: Row[] = [
  // Featured, so it is the one campaign in single-campaign mode: past its goal to show the Achieved badge and every milestone.
  ["default", "Campaign Title", "One sentence on the change this campaign asks for.", 8000, 8452, -21, 30, true, -2],
  ["achieved-campaign", "Achieved Campaign Title", "Past its goal and still collecting signatures.", 10000, 10842, -40, 14, false, -3],
  ["scheduled-campaign", "Scheduled Campaign Title", "Opens for signatures in a few days.", 5000, 0, 3, 40, false, null],
  ["ended-achieved-campaign", "Ended Campaign Title", "Closed after reaching its goal.", 5000, 5310, -90, -10, false, -25],
  ["closed-campaign", "Closed Campaign Title", "Closed before reaching its goal.", 3000, 1204, -120, -60, false, null],
];

/** Five campaigns covering every public state: live + achieved (featured), live + achieved, scheduled, ended + achieved, ended. */
export function seedCampaigns(now = Date.now()): Campaign[] {
  // Whole minutes, like the admin form, so saving an untouched seeded campaign doesn't count as moving its start.
  const iso = (days: number) => new Date(Math.floor((now + days * DAY) / 60_000) * 60_000).toISOString();
  return campaignRows.map(([slug, title, subtitle, goal, signatureCount, start, end, featured, reached]) => ({
    slug,
    title,
    subtitle,
    description,
    descriptionText: docToText(description),
    goal,
    milestones: milestoneLadder(goal),
    startAt: iso(start),
    endAt: end === null ? null : iso(end),
    timeZone: "Asia/Jakarta",
    status: "published",
    featured,
    signatureCount,
    goalReachedAt: reached === null ? null : iso(reached),
    deletedAt: null,
    createdAt: iso(start - 7),
    updatedAt: iso(start - 7),
  }));
}

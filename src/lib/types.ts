export type Petition = {
  id: string;
  title: string;
  description: string;
  goal: number;
  signatureCount: number;
};

export type Comment = {
  id: string;
  name: string;
  message: string;
  avatarUrl: string | null;
  avatarPreset?: number | null; // initials colour, used when avatarUrl is null
  pinned: boolean;
  hidden?: boolean; // set by moderation; hidden comments never reach the public list
  createdAt: string; // ISO 8601, serialisable across the server/client boundary
};

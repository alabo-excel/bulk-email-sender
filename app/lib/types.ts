export type ContactList = {
  id: string;
  name: string;
  uploadedAt: number;
  headers: string[];
  rows: Record<string, string>[];
};

export type SendAttempt = {
  email: string;
  rowNumber: number;
  subject: string;
  body?: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  reason?: string;
  sentAt: number;
};

export type SendReport = {
  id: string;
  listId: string;
  listName: string;
  startedAt: number;
  finishedAt: number;
  dryRun: boolean;
  attempts: SendAttempt[];
};


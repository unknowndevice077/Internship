export type Role = "owner" | "admin" | "member" | "viewer";

export interface UserBrief {
  id: number;
  email: string;
  full_name: string;
}

export interface WorkspaceBrief {
  slug: string;
  name: string;
  plan: string;
  role: Role;
}

export interface Me extends UserBrief {
  workspaces: WorkspaceBrief[];
}

export interface Member {
  id: number;
  user: UserBrief;
  role: Role;
  joined_at: string;
}

export interface Project {
  id: number;
  name: string;
  key: string;
  description: string;
  lead: number | null;
  issue_count?: number;
  created_at: string;
}

export type StatusCategory = "todo" | "in_progress" | "done";

export interface Status {
  id: number;
  project: number;
  name: string;
  category: StatusCategory;
  order: number;
}

export type IssueType = "task" | "bug" | "story" | "epic";
export type Priority = "lowest" | "low" | "medium" | "high" | "highest";

export interface BoardIssue {
  id: number;
  key: string;
  title: string;
  type: IssueType;
  priority: Priority;
  status: number;
  sprint: number | null;
  assignee: UserBrief | null;
  story_points: number | null;
  rank: number;
}

export interface Issue {
  id: number;
  key: string;
  project: number;
  number: number;
  title: string;
  description: string;
  type: IssueType;
  priority: Priority;
  status: number;
  sprint: number | null;
  assignee: number | null;
  assignee_detail: UserBrief | null;
  reporter: UserBrief | null;
  story_points: number | null;
  rank: number;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn extends Status {
  issues: BoardIssue[];
}

export interface Board {
  project: Project;
  columns: BoardColumn[];
  transitions: [number, number][];
}

export interface Sprint {
  id: number;
  project: number;
  name: string;
  goal: string;
  state: "planned" | "active" | "closed";
  start_date: string | null;
  end_date: string | null;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Transition {
  id: number;
  project: number;
  from_status: number;
  to_status: number;
}

export interface Comment {
  id: number;
  issue: number;
  author: UserBrief | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: number;
  issue: number;
  name: string;
  size: number;
  content_type: string;
  uploaded_by: UserBrief | null;
  download_url: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  actor: UserBrief | null;
  action: "created" | "updated" | "deleted" | "moved" | "commented" | "attached";
  entity_type: string;
  entity_id: number;
  entity_label: string;
  changes: Record<string, [unknown, unknown]>;
  issue: number | null;
  created_at: string;
}

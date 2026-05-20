export type Platform = "tiktok" | "instagram" | "youtube" | "linkedin" | "x";

export type CreatorCategory =
  | "asesor_hipotecario"
  | "comprar_piso"
  | "finanzas_personales"
  | "agente_comprador"
  | "inmobiliario_didactico"
  | "arquitecto_tecnico"
  | "abogado_inmobiliario"
  | "cuenta_local"
  | "inversor_inmobiliario"
  | "reformista"
  | "viral_general";

export type ViralTaskType =
  | "keyword_search"
  | "save_videos"
  | "comment"
  | "follow_accounts"
  | "hooks"
  | "outreach"
  | "create_video";

export type EntityStatus =
  | "suggested"
  | "reviewed"
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "followed"
  | "warm_commented"
  | "ready_to_contact"
  | "contacted"
  | "replied"
  | "collaboration_agreed"
  | "rejected"
  | "archived";

export type ViralTask = {
  id: string;
  type: ViralTaskType;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  difficulty: "easy" | "medium" | "hard";
  estimatedMinutes: number;
  status: EntityStatus;
  actionLabel: string;
  notes?: string;
  result?: unknown;
};

export type ViralKeyword = {
  id: string;
  keyword: string;
  category: string;
  intent: string;
  platforms: Platform[];
  platformPriority?: Platform[];
  searchUrls: Record<string, string>;
  whatToLookFor: string[];
  suggestedComments?: string[];
  suggestedHooks?: string[];
  status: EntityStatus;
  performanceScore?: number;
  notes?: string;
};

export type ViralCreator = {
  id: string;
  name?: string;
  handle: string;
  platform: Platform;
  url: string;
  category: CreatorCategory;
  city?: string;
  country?: string;
  followers?: number;
  avgViews?: number;
  avgComments?: number;
  postingFrequency?: string;
  topics: string[];
  creatorFitScore: number;
  outreachScore: number;
  whyRelevant: string;
  bestCollabIdea: string;
  recommendedAction: string;
  status: EntityStatus;
  notes?: string;
};

export type ViralComment = {
  id: string;
  text: string;
  type: string;
  bestFor: string;
  brandMention: boolean;
  risk: "low" | "medium" | "high";
  status: EntityStatus;
  copiedAt?: string | null;
  usedOnUrl?: string | null;
  resultLikes?: number | null;
  resultReplies?: number | null;
};

export type ViralHook = {
  id: string;
  hook: string;
  category: string;
  series: string;
  suggestedDuration: number;
  suggestedCta: string;
  overlayExample: string;
  scriptPreview: string;
  status: EntityStatus;
  performanceScore?: number;
};

export type ViralRoutine = {
  id: string;
  date: string;
  theme: string;
  dailyGoal: string;
  status: EntityStatus;
  completionRate: number;
  keywords: ViralKeyword[];
  comments: ViralComment[];
  followQueue: ViralCreator[];
  hooks: ViralHook[];
  creatorToContact: ViralCreator | null;
  tasks: ViralTask[];
};

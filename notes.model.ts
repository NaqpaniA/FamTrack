export type NoteScope = 'FAMILY' | 'PERSONAL';
export type NoteContentType = 'TEXT' | 'CHECKLIST';

export interface NoteChecklistItem {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Note {
  id: string;
  scope: NoteScope;
  contentType: NoteContentType;
  title: string;
  body?: string;
  checklistItems: NoteChecklistItem[];
  createdById: string;
  updatedById?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export const NOTE_SCOPE_LABELS: Record<NoteScope, string> = {
  FAMILY: 'Семейная',
  PERSONAL: 'Личная'
};

export const NOTE_CONTENT_TYPE_LABELS: Record<NoteContentType, string> = {
  TEXT: 'Текст',
  CHECKLIST: 'Чеклист'
};

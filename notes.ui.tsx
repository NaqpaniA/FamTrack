import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  CheckSquare,
  FileText,
  Lock,
  Pin,
  Plus,
  RotateCcw,
  Search,
  StickyNote,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { AppData } from './types';
import { Note, NoteChecklistItem, NoteContentType, NoteScope, NOTE_CONTENT_TYPE_LABELS, NOTE_SCOPE_LABELS } from './notes.model';
import { Avatar, Panel, SectionHeader, SegmentedControl } from './ui-kit';
import { generateId } from './utils';

type NotesInitialMode = 'list' | 'new';
type NoteFilter = 'ALL' | 'FAMILY' | 'PERSONAL' | 'ARCHIVE';

const sortNotes = (notes: Note[]) => [...notes].sort((left, right) => {
  const pinnedDiff = Number(!!right.isPinned) - Number(!!left.isPinned);
  if (pinnedDiff !== 0) return pinnedDiff;
  return right.updatedAt - left.updatedAt;
});

const formatNoteDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('ru-RU', {
  day: '2-digit',
  month: 'short'
});

const noteProgress = (note: Note) => {
  const total = note.checklistItems.length;
  const done = note.checklistItems.filter(item => item.isCompleted).length;
  return { total, done };
};

const notePreview = (note: Note) => {
  if (note.contentType === 'CHECKLIST') {
    const { done, total } = noteProgress(note);
    return total > 0 ? `${done}/${total} выполнено` : 'Пустой чеклист';
  }
  return note.body?.trim() || 'Без текста';
};

const noteScopeClasses: Record<NoteScope, string> = {
  FAMILY: 'bg-blue-50 text-blue-700 border-blue-100',
  PERSONAL: 'bg-gray-100 text-gray-600 border-gray-200'
};

export const NotesWidget = ({
  data,
  onOpenAll,
  onCreate
}: {
  data: AppData;
  onOpenAll: () => void;
  onCreate: () => void;
}) => {
  const notes = sortNotes((data.notes || []).filter(note => !note.isArchived)).slice(0, 3);

  return (
    <div>
      <SectionHeader
        title="Заметки"
        icon={StickyNote}
        action={
          <div className="flex items-center gap-2">
            <button onClick={onCreate} className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center active:scale-95 transition-transform" aria-label="Новая заметка">
              <Plus size={17} />
            </button>
            <button onClick={onOpenAll} className="text-blue-600 text-sm font-medium">Все</button>
          </div>
        }
      />
      <Panel className="mt-3 overflow-hidden">
        {notes.length === 0 ? (
          <button onClick={onCreate} className="w-full p-4 text-left flex items-center gap-3 active:bg-gray-50 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center">
              <StickyNote size={20} />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">Пока нет заметок</div>
              <div className="text-xs text-gray-400">Добавить первую</div>
            </div>
          </button>
        ) : (
          notes.map((note, index) => (
            <button
              key={note.id}
              onClick={onOpenAll}
              className={`w-full p-3 text-left flex gap-3 active:bg-gray-50 transition-colors ${index > 0 ? 'border-t border-gray-50' : ''}`}
            >
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${note.scope === 'PERSONAL' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>
                {note.contentType === 'CHECKLIST' ? <CheckSquare size={19} /> : <FileText size={19} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {note.isPinned && <Pin size={12} className="text-yellow-600 fill-yellow-100" />}
                  <div className="font-bold text-sm text-gray-950 truncate">{note.title}</div>
                </div>
                <div className="text-xs text-gray-400 truncate">{notePreview(note)}</div>
              </div>
              <div className="text-[10px] text-gray-400 shrink-0">{formatNoteDate(note.updatedAt)}</div>
            </button>
          ))
        )}
      </Panel>
    </div>
  );
};

export const NotesSheet = ({
  isOpen,
  initialMode,
  requestId,
  data,
  onClose,
  onSave,
  onDelete
}: {
  isOpen: boolean;
  initialMode: NotesInitialMode;
  requestId: number;
  data: AppData;
  onClose: () => void;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
}) => {
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [filter, setFilter] = useState<NoteFilter>('ALL');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setView(initialMode === 'new' ? 'editor' : 'list');
    setEditingNote(null);
    setQuery('');
  }, [isOpen, initialMode, requestId]);

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortNotes(data.notes || []).filter(note => {
      if (filter === 'ARCHIVE') {
        if (!note.isArchived) return false;
      } else {
        if (note.isArchived) return false;
        if (filter !== 'ALL' && note.scope !== filter) return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        note.title,
        note.body || '',
        ...note.checklistItems.map(item => item.title)
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [data.notes, filter, query]);

  if (!isOpen) return null;

  const openEditor = (note: Note | null) => {
    setEditingNote(note);
    setView('editor');
  };

  const closeEditor = () => {
    setEditingNote(null);
    setView('list');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl h-[92svh] bg-[#f5f6f8] rounded-t-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 duration-300"
        onClick={event => event.stopPropagation()}
      >
        <div className="px-4 pt-3 pb-2 bg-white/95 border-b border-gray-200/80 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-3" />
          <div className="flex items-center justify-between gap-3">
            <button onClick={view === 'editor' ? closeEditor : onClose} className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95 transition-transform" aria-label="Закрыть">
              <X size={19} />
            </button>
            <div className="text-center">
              <h2 className="text-lg font-black text-gray-950 leading-tight">{view === 'editor' ? (editingNote ? 'Заметка' : 'Новая заметка') : 'Заметки'}</h2>
              <div className="text-xs text-gray-400">{data.family?.name || 'FamTrack'}</div>
            </div>
            {view === 'list' ? (
              <button onClick={() => openEditor(null)} className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center active:scale-95 transition-transform" aria-label="Новая заметка">
                <Plus size={20} />
              </button>
            ) : (
              <div className="w-10 h-10" aria-hidden="true" />
            )}
          </div>
        </div>

        {view === 'editor' ? (
          <NoteEditor
            key={editingNote?.id || `new-${requestId}`}
            note={editingNote}
            data={data}
            onSave={(note) => {
              onSave(note);
              closeEditor();
            }}
            onDelete={(id) => {
              onDelete(id);
              closeEditor();
            }}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-[calc(var(--bottom-nav-height)+24px)]">
            <div className="space-y-3">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Поиск"
                  className="w-full h-11 rounded-2xl bg-white border border-gray-200 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                />
              </div>
              <SegmentedControl
                value={filter}
                onChange={setFilter}
                className="w-full grid grid-cols-4"
                options={[
                  { value: 'ALL', label: 'Все' },
                  { value: 'FAMILY', label: 'Семья' },
                  { value: 'PERSONAL', label: 'Личные' },
                  { value: 'ARCHIVE', label: 'Архив' }
                ]}
              />
            </div>

            {filteredNotes.length === 0 ? (
              <div className="text-center p-8 bg-white border border-dashed border-gray-200 rounded-2xl text-gray-400">
                <StickyNote className="mx-auto mb-2 opacity-50" size={30} />
                <div className="text-sm font-medium">Ничего не найдено</div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNotes.map(note => (
                  <NoteCard key={note.id} note={note} data={data} onClick={() => openEditor(note)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const NoteCard = ({ note, data, onClick }: { key?: React.Key; note: Note; data: AppData; onClick: () => void }) => {
  const author = data.members.find(member => member.id === note.createdById) || data.currentUser;
  const { done, total } = noteProgress(note);

  return (
    <button onClick={onClick} className="w-full app-panel p-4 text-left active:scale-[0.99] transition-transform">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {note.isPinned && <Pin size={13} className="text-yellow-600 fill-yellow-100 shrink-0" />}
            <h3 className="font-black text-gray-950 text-[16px] leading-tight truncate">{note.title}</h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Avatar user={author} size="sm" />
            <span>{author.name}</span>
            <span>·</span>
            <span>{formatNoteDate(note.updatedAt)}</span>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full border text-[10px] font-bold shrink-0 ${noteScopeClasses[note.scope]}`}>
          {note.scope === 'PERSONAL' ? <Lock size={10} className="inline mr-1" /> : <Users size={10} className="inline mr-1" />}
          {NOTE_SCOPE_LABELS[note.scope]}
        </span>
      </div>
      {note.contentType === 'CHECKLIST' ? (
        <div className="space-y-2">
          <div className="text-xs font-bold text-gray-500">{done}/{total} выполнено</div>
          <div className="space-y-1.5">
            {note.checklistItems.slice(0, 3).map(item => (
              <div key={item.id} className="flex items-center gap-2 text-sm text-gray-700">
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${item.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                  {item.isCompleted && <Check size={10} />}
                </span>
                <span className={`truncate ${item.isCompleted ? 'line-through text-gray-400' : ''}`}>{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">{notePreview(note)}</p>
      )}
    </button>
  );
};

const NoteEditor = ({
  note,
  data,
  onSave,
  onDelete
}: {
  key?: React.Key;
  note: Note | null;
  data: AppData;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
}) => {
  const now = Date.now();
  const [title, setTitle] = useState(note?.title || '');
  const [body, setBody] = useState(note?.body || '');
  const [scope, setScope] = useState<NoteScope>(note?.scope || 'FAMILY');
  const [contentType, setContentType] = useState<NoteContentType>(note?.contentType || 'TEXT');
  const [isPinned, setPinned] = useState(!!note?.isPinned);
  const [items, setItems] = useState<NoteChecklistItem[]>(note?.checklistItems || []);
  const [newItemTitle, setNewItemTitle] = useState('');
  const isExisting = !!note;

  const addItem = () => {
    const nextTitle = newItemTitle.trim();
    if (!nextTitle) return;
    setItems(prev => [...prev, { id: generateId(), title: nextTitle, isCompleted: false }]);
    setNewItemTitle('');
  };

  const save = (archiveState?: boolean) => {
    const nextTitle = title.trim() || 'Без названия';
    onSave({
      id: note?.id || generateId(),
      title: nextTitle,
      body: body.trim() || undefined,
      scope,
      contentType,
      checklistItems: contentType === 'CHECKLIST' ? items : [],
      createdById: note?.createdById || data.currentUser.id,
      updatedById: data.currentUser.id,
      isPinned,
      isArchived: archiveState ?? note?.isArchived ?? false,
      createdAt: note?.createdAt || now,
      updatedAt: now
    });
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(var(--bottom-nav-height)+24px)] space-y-4">
      <div className="app-panel p-4 space-y-4">
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Название"
          className="w-full text-xl font-black text-gray-950 outline-none placeholder:text-gray-300 bg-transparent"
        />

        <div className="flex flex-wrap items-center gap-2">
          {isExisting ? (
            <span className={`px-3 py-2 rounded-xl border text-xs font-bold ${noteScopeClasses[scope]}`}>
              {NOTE_SCOPE_LABELS[scope]}
            </span>
          ) : (
            <SegmentedControl
              value={scope}
              onChange={setScope}
              options={[
                { value: 'FAMILY', label: 'Семейная', icon: Users },
                { value: 'PERSONAL', label: 'Личная', icon: Lock }
              ]}
            />
          )}
          <SegmentedControl
            value={contentType}
            onChange={setContentType}
            options={[
              { value: 'TEXT', label: NOTE_CONTENT_TYPE_LABELS.TEXT, icon: FileText },
              { value: 'CHECKLIST', label: NOTE_CONTENT_TYPE_LABELS.CHECKLIST, icon: CheckSquare }
            ]}
          />
          <button
            onClick={() => setPinned(prev => !prev)}
            className={`h-10 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${isPinned ? 'bg-yellow-50 border-yellow-100 text-yellow-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
          >
            <Pin size={15} />
            Закрепить
          </button>
        </div>

        {contentType === 'TEXT' ? (
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Текст заметки"
            className="w-full min-h-[220px] resize-none rounded-2xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={newItemTitle}
                onChange={event => setNewItemTitle(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addItem();
                }}
                placeholder="Пункт чеклиста"
                className="flex-1 h-11 rounded-2xl bg-gray-50 border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
              <button onClick={addItem} className="w-11 h-11 rounded-2xl bg-black text-white flex items-center justify-center active:scale-95 transition-transform" aria-label="Добавить пункт">
                <Plus size={19} />
              </button>
            </div>

            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-2">
                  <button
                    onClick={() => setItems(prev => prev.map(current => current.id === item.id ? { ...current, isCompleted: !current.isCompleted } : current))}
                    className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${item.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300 text-gray-300'}`}
                    aria-label="Отметить пункт"
                  >
                    <Check size={16} />
                  </button>
                  <input
                    value={item.title}
                    onChange={event => setItems(prev => prev.map(current => current.id === item.id ? { ...current, title: event.target.value } : current))}
                    className={`flex-1 min-w-0 bg-transparent outline-none text-sm ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}
                  />
                  <button
                    onClick={() => setItems(prev => prev.filter(current => current.id !== item.id))}
                    className="w-8 h-8 rounded-full bg-white text-gray-400 flex items-center justify-center border border-gray-100"
                    aria-label="Удалить пункт"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button onClick={() => save()} className="h-12 rounded-2xl bg-black text-white font-bold active:scale-[0.99] transition-transform">
          Сохранить
        </button>
        {isExisting && (
          <button
            onClick={() => save(!note?.isArchived)}
            className="w-12 h-12 rounded-2xl bg-white border border-gray-200 text-gray-600 flex items-center justify-center active:scale-95 transition-transform"
            aria-label={note?.isArchived ? 'Вернуть из архива' : 'В архив'}
          >
            {note?.isArchived ? <RotateCcw size={19} /> : <Archive size={19} />}
          </button>
        )}
      </div>

      {isExisting && (
        <button
          onClick={() => {
            if (confirm('Удалить заметку?')) onDelete(note.id);
          }}
          className="w-full h-11 rounded-2xl bg-red-50 text-red-600 font-bold flex items-center justify-center gap-2 border border-red-100"
        >
          <Trash2 size={17} />
          Удалить
        </button>
      )}
    </div>
  );
};

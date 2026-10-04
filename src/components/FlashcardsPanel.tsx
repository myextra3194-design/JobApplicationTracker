import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { createFlashcard } from '../lib/study/cards';
import { parseFlashcardFileName, parseFlashcardText } from '../lib/study/import';
import { dueFlashcards, formatDueAt, formatInterval, planReview, rateFlashcard } from '../lib/study/schedule';
import { getStorage } from '../lib/storage';
import type { Flashcard, FlashcardDraft, FlashcardRating } from '../lib/study/types';
import { pushToast } from '../lib/toast';

const ALL_DECKS = 'All decks';
const SUPPORTED_SOURCE_BYTES = 1_000_000;

export function FlashcardsPanel() {
  const store = getStorage().flashcards;
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState(ALL_DECKS);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ card: Flashcard | null; deck: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [answerShown, setAnswerShown] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      setCards(await store.all());
      setLoadError(null);
    } catch (error) {
      setLoadError(messageOf(error));
    }
  }, [store]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const allCards = cards ?? [];
  const deckNames = useMemo(
    () => [...new Set(allCards.map((card) => card.deck))].sort((a, b) => a.localeCompare(b)),
    [allCards],
  );
  const deckCards = useMemo(
    () => (selectedDeck === ALL_DECKS ? allCards : allCards.filter((card) => card.deck === selectedDeck)),
    [allCards, selectedDeck],
  );
  const dueCards = useMemo(() => dueFlashcards(deckCards), [deckCards]);
  const filteredCards = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return deckCards
      .filter((card) => !needle || `${card.front}\n${card.back}\n${card.deck}`.toLocaleLowerCase().includes(needle))
      .slice()
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || b.updatedAt.localeCompare(a.updatedAt));
  }, [deckCards, search]);

  const currentSessionCard = useMemo(() => {
    const id = sessionQueue[sessionIndex];
    return id ? allCards.find((card) => card.id === id) ?? null : null;
  }, [allCards, sessionIndex, sessionQueue]);
  const sessionComplete = sessionActive && sessionIndex >= sessionQueue.length;

  async function saveCard(card: Flashcard): Promise<void> {
    try {
      await store.put(card);
      setCards(await store.all());
      setEditor(null);
      setLoadError(null);
      pushToast(card.createdAt === card.updatedAt ? 'Flashcard added.' : 'Flashcard updated.', 'success');
    } catch (error) {
      setLoadError(messageOf(error));
      throw error;
    }
  }

  async function saveImportedCards(drafts: FlashcardDraft[], deck: string): Promise<void> {
    const now = new Date();
    const newCards = drafts.map((draft) => createFlashcard(draft.front, draft.back, deck, now));
    try {
      await store.putMany(newCards);
      setCards(await store.all());
      setImportOpen(false);
      setLoadError(null);
      pushToast(`${newCards.length} flashcard${newCards.length === 1 ? '' : 's'} added to ${deck}.`, 'success');
    } catch (error) {
      setLoadError(messageOf(error));
      throw error;
    }
  }

  async function deleteCard(card: Flashcard): Promise<void> {
    if (!window.confirm(`Delete this flashcard from “${card.deck}”? This cannot be undone.`)) return;
    try {
      await store.delete(card.id);
      setCards(await store.all());
      pushToast('Flashcard deleted.', 'success');
    } catch (error) {
      setLoadError(messageOf(error));
    }
  }

  function startSession(): void {
    const queue = dueFlashcards(deckCards).map((card) => card.id);
    if (queue.length === 0) return;
    setSessionQueue(queue);
    setSessionIndex(0);
    setAnswerShown(false);
    setSessionActive(true);
  }

  function finishSession(): void {
    setSessionActive(false);
    setSessionQueue([]);
    setSessionIndex(0);
    setAnswerShown(false);
  }

  async function rateCurrentCard(rating: FlashcardRating): Promise<void> {
    if (!currentSessionCard || reviewSaving) return;
    setReviewSaving(true);
    try {
      const reviewed = rateFlashcard(currentSessionCard, rating);
      await store.put(reviewed);
      setCards((current) => (current ?? []).map((card) => (card.id === reviewed.id ? reviewed : card)));
      setSessionIndex((current) => current + 1);
      setAnswerShown(false);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageOf(error));
    } finally {
      setReviewSaving(false);
    }
  }

  if (cards === null) {
    return (
      <section className="rounded-2xl border border-hairline bg-surface p-6 text-sm text-muted" aria-live="polite">
        Loading your study cards…
        {loadError ? <p className="mt-2 text-red-700 dark:text-red-200">{loadError}</p> : null}
      </section>
    );
  }

  if (sessionActive) {
    return (
      <StudySession
        current={currentSessionCard}
        complete={sessionComplete}
        completed={sessionIndex}
        total={sessionQueue.length}
        answerShown={answerShown}
        saving={reviewSaving}
        onReveal={() => setAnswerShown(true)}
        onRate={(rating) => void rateCurrentCard(rating)}
        onFinish={finishSession}
      />
    );
  }

  const masteredCount = allCards.filter((card) => card.repetitions >= 3).length;
  const activeDeckLabel = selectedDeck === ALL_DECKS ? 'all decks' : selectedDeck;

  return (
    <section className="space-y-5" aria-label="Study flashcards">
      <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-28 -z-10 size-72 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-36 left-1/3 -z-10 size-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200">Study space · spaced recall</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Make every review count.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Retrieve an answer from memory, then rate how it felt. Your next review is scheduled around your recall — and stays on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={startSession}
            disabled={dueCards.length === 0}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden>✦</span>
            {dueCards.length > 0 ? `Study now · ${dueCards.length} due` : 'All caught up'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 sm:max-w-lg sm:gap-3">
          <HeroMetric label="Due now" value={dueCards.length} />
          <HeroMetric label="Flashcards" value={allCards.length} />
          <HeroMetric label="Mastered" value={masteredCount} />
        </div>
        <p className="mt-4 text-[11px] text-slate-400">Showing {activeDeckLabel} · New cards are due right away</p>
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
          {loadError}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Your library</p>
              <h3 className="mt-1 text-sm font-semibold text-ink">Decks</h3>
            </div>
            <span className="rounded-full bg-surface-raised px-2 py-1 text-[11px] font-medium text-muted">{deckNames.length}</span>
          </div>

          <div className="mt-3 space-y-1" role="group" aria-label="Flashcard decks">
            <DeckButton
              label={ALL_DECKS}
              count={allCards.length}
              dueCount={dueFlashcards(allCards).length}
              selected={selectedDeck === ALL_DECKS}
              onClick={() => setSelectedDeck(ALL_DECKS)}
            />
            {deckNames.map((deck) => {
              const deckItems = allCards.filter((card) => card.deck === deck);
              return (
                <DeckButton
                  key={deck}
                  label={deck}
                  count={deckItems.length}
                  dueCount={dueFlashcards(deckItems).length}
                  selected={selectedDeck === deck}
                  onClick={() => setSelectedDeck(deck)}
                />
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={() => setEditor({ card: null, deck: selectedDeck === ALL_DECKS ? 'General' : selectedDeck })}
              className="gradient-accent inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm"
            >
              <span aria-hidden>＋</span> Add flashcard
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-raised px-3 py-2.5 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent"
            >
              <span aria-hidden>⇧</span> Draft from text / CSV
            </button>
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-faint">Private to this browser. No account or AI connection is configured.</p>
        </aside>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Card library</p>
              <h3 className="mt-1 text-base font-semibold text-ink">{selectedDeck === ALL_DECKS ? 'All flashcards' : selectedDeck}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {filteredCards.length} card{filteredCards.length === 1 ? '' : 's'} · {dueCards.length} due for review
              </p>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <span className="sr-only">Search flashcards</span>
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search prompts and answers"
                className="w-full rounded-xl border border-hairline bg-canvas py-2 pl-8 pr-3 text-xs text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
                type="search"
              />
            </label>
          </div>

          {filteredCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-surface p-7 text-center sm:p-10">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-2xl text-accent" aria-hidden>✦</div>
              <h3 className="mt-4 text-base font-semibold text-ink">{allCards.length === 0 ? 'Start with one good question' : 'No matching cards'}</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted">
                {allCards.length === 0
                  ? 'Create a prompt and answer, or import a small Q&A text file to review editable drafts before adding them.'
                  : 'Try another search, or choose a different deck.'}
              </p>
              {allCards.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setEditor({ card: null, deck: 'General' })}
                  className="gradient-accent mt-5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm"
                >
                  Create your first flashcard
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredCards.map((card) => (
                <FlashcardRow
                  key={card.id}
                  card={card}
                  onEdit={() => setEditor({ card, deck: card.deck })}
                  onDelete={() => void deleteCard(card)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editor ? (
        <FlashcardEditor
          initial={editor.card}
          initialDeck={editor.deck}
          deckNames={deckNames}
          onClose={() => setEditor(null)}
          onSave={saveCard}
        />
      ) : null}
      {importOpen ? (
        <FlashcardImport
          initialDeck={selectedDeck === ALL_DECKS ? 'General' : selectedDeck}
          onClose={() => setImportOpen(false)}
          onImport={saveImportedCards}
        />
      ) : null}
    </section>
  );
}

function HeroMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2.5">
      <p className="text-xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-[10px] font-medium text-slate-400 sm:text-[11px]">{label}</p>
    </div>
  );
}

function DeckButton({
  label,
  count,
  dueCount,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  dueCount: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition ${
        selected ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-raised hover:text-ink'
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${selected ? 'bg-accent' : 'bg-faint/60'}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {dueCount > 0 ? <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-200">{dueCount} due</span> : null}
      <span className="tabular-nums text-[10px] text-faint">{count}</span>
    </button>
  );
}

function FlashcardRow({ card, onEdit, onDelete }: { card: Flashcard; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="min-w-0 rounded-2xl border border-hairline bg-surface p-4 shadow-sm transition hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="max-w-full truncate rounded-md bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent">{card.deck}</span>
          {card.repetitions === 0 ? (
            <span className="rounded-md bg-surface-raised px-2 py-1 text-[10px] font-medium text-muted">New</span>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
            Date.parse(card.dueAt) <= Date.now()
              ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
              : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {formatDueAt(card.dueAt)}
        </span>
      </div>
      <h4 className="mt-3 break-words text-sm font-semibold leading-relaxed text-ink">{card.front}</h4>
      <details className="group mt-2 rounded-xl bg-surface-raised/70 px-3 py-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-muted marker:hidden group-open:text-accent">
          <span className="group-open:hidden">Show answer</span>
          <span className="hidden group-open:inline">Hide answer</span>
        </summary>
        <p className="mt-2 whitespace-pre-wrap break-words border-t border-hairline pt-2 text-xs leading-relaxed text-ink">{card.back}</p>
      </details>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3">
        <span className="text-[10px] text-faint">
          {card.repetitions} successful review{card.repetitions === 1 ? '' : 's'}{card.lapses > 0 ? ` · ${card.lapses} lapse${card.lapses === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={onEdit} className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-surface-raised hover:text-accent">Edit</button>
          <button type="button" onClick={onDelete} aria-label={`Delete flashcard: ${card.front}`} className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-red-500/10 hover:text-red-600">Delete</button>
        </div>
      </div>
    </article>
  );
}

function StudySession({
  current,
  complete,
  completed,
  total,
  answerShown,
  saving,
  onReveal,
  onRate,
  onFinish,
}: {
  current: Flashcard | null;
  complete: boolean;
  completed: number;
  total: number;
  answerShown: boolean;
  saving: boolean;
  onReveal: () => void;
  onRate: (rating: FlashcardRating) => void;
  onFinish: () => void;
}) {
  const progress = total === 0 ? 100 : Math.min(100, Math.round((completed / total) * 100));
  if (complete || !current) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-[1.75rem] border border-hairline bg-surface p-6 text-center shadow-sm sm:p-10" aria-label="Study session complete">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-2xl text-emerald-600" aria-hidden>✓</div>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Session complete</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">A little more recall, locked in.</h2>
        <p className="mt-2 text-sm text-muted">You reviewed {completed} card{completed === 1 ? '' : 's'}. The next dates are already on your schedule.</p>
        <button type="button" onClick={onFinish} className="gradient-accent mt-6 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm">Back to your library</button>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4" aria-label="Flashcard review session">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Spaced recall</p>
          <h2 className="mt-1 truncate text-lg font-semibold text-ink">{current.deck}</h2>
        </div>
        <button type="button" onClick={onFinish} className="rounded-xl border border-hairline bg-surface px-3 py-2 text-xs font-medium text-muted hover:text-ink">End session</button>
      </div>
      <div
        role="progressbar"
        aria-label="Study session progress"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, total)}
        aria-valuenow={Math.min(completed, total)}
        className="rounded-full bg-surface-soft p-0.5"
      >
        <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted"><span>Card {completed + 1} of {total}</span><span>{completed} completed</span></div>

      <article className="flex min-h-[21rem] flex-col justify-between rounded-[1.75rem] border border-hairline bg-surface p-5 shadow-lg sm:min-h-[25rem] sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent">{current.deck}</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">{answerShown ? 'Answer' : 'Prompt'}</span>
        </div>
        <div className="py-8 text-center">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">{answerShown ? 'Recall check' : 'Try to answer from memory'}</p>
          <h3 className="whitespace-pre-wrap break-words text-xl font-semibold leading-relaxed text-ink sm:text-2xl">{answerShown ? current.back : current.front}</h3>
        </div>
        <div className="min-h-12">
          {!answerShown ? (
            <button type="button" onClick={onReveal} className="gradient-accent mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm">
              Show answer <span aria-hidden>↗</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['again', 'Again', 'rose'],
                  ['hard', 'Hard', 'amber'],
                  ['good', 'Good', 'emerald'],
                  ['easy', 'Easy', 'violet'],
                ] as const
              ).map(([rating, label, color]) => {
                const interval = formatInterval(planReview(current, rating).delayMs);
                return (
                  <button
                    key={rating}
                    type="button"
                    disabled={saving}
                    onClick={() => onRate(rating)}
                    className={`rounded-xl border px-2 py-2.5 text-left transition disabled:opacity-50 ${ratingClass(color)}`}
                    aria-label={`${label}, review again in ${interval}`}
                  >
                    <span className="block text-xs font-semibold">{label}</span>
                    <span className="mt-0.5 block text-[10px] opacity-75">{interval}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </article>
      <p className="text-center text-[11px] leading-relaxed text-faint">Rate honestly — “Again” brings this card back in 10 minutes, while the other ratings adapt the next interval.</p>
    </section>
  );
}

function ratingClass(color: 'rose' | 'amber' | 'emerald' | 'violet'): string {
  const classes = {
    rose: 'border-rose-500/25 bg-rose-500/5 text-rose-700 hover:border-rose-500/50 hover:bg-rose-500/10 dark:text-rose-200',
    amber: 'border-amber-500/25 bg-amber-500/5 text-amber-800 hover:border-amber-500/50 hover:bg-amber-500/10 dark:text-amber-200',
    emerald: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-800 hover:border-emerald-500/50 hover:bg-emerald-500/10 dark:text-emerald-200',
    violet: 'border-violet-500/25 bg-violet-500/5 text-violet-800 hover:border-violet-500/50 hover:bg-violet-500/10 dark:text-violet-200',
  };
  return classes[color];
}

function FlashcardEditor({
  initial,
  initialDeck,
  deckNames,
  onClose,
  onSave,
}: {
  initial: Flashcard | null;
  initialDeck: string;
  deckNames: string[];
  onClose: () => void;
  onSave: (card: Flashcard) => Promise<void>;
}) {
  const [deck, setDeck] = useState(initial?.deck ?? initialDeck);
  const [front, setFront] = useState(initial?.front ?? '');
  const [back, setBack] = useState(initial?.back ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = initial ? 'edit-flashcard-title' : 'new-flashcard-title';

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (!front.trim() || !back.trim()) {
      setError('Add both a prompt and an answer before saving.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const card = initial
        ? { ...initial, deck: deck.trim() || 'General', front: front.trim(), back: back.trim(), updatedAt: new Date().toISOString() }
        : createFlashcard(front, back, deck);
      await onSave(card);
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal titleId={titleId} onClose={onClose}>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Card editor</p>
        <h2 id={titleId} className="mt-1 text-lg font-semibold text-ink">{initial ? 'Edit flashcard' : 'New flashcard'}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">A clear question on one side; a short, useful answer on the other.</p>
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="block space-y-1.5 text-xs font-medium text-muted">
          Deck
          <input list="flashcard-decks" value={deck} onChange={(event) => setDeck(event.target.value)} maxLength={120} placeholder="General" className={inputClass()} />
          <datalist id="flashcard-decks">{deckNames.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-muted">
          Prompt
          <textarea autoFocus value={front} onChange={(event) => setFront(event.target.value)} maxLength={10_000} rows={4} placeholder="What do you want to remember?" className={`${inputClass()} min-h-24 resize-y`} />
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-muted">
          Answer
          <textarea value={back} onChange={(event) => setBack(event.target.value)} maxLength={20_000} rows={5} placeholder="Write the answer in your own words…" className={`${inputClass()} min-h-28 resize-y`} />
        </label>
        {error ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-muted hover:text-ink disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy} className="gradient-accent rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm">{busy ? 'Saving…' : initial ? 'Save changes' : 'Add flashcard'}</button>
        </div>
      </form>
    </Modal>
  );
}

function FlashcardImport({
  initialDeck,
  onClose,
  onImport,
}: {
  initialDeck: string;
  onClose: () => void;
  onImport: (drafts: FlashcardDraft[], deck: string) => Promise<void>;
}) {
  const [deck, setDeck] = useState(initialDeck);
  const [source, setSource] = useState('');
  const [drafts, setDrafts] = useState<FlashcardDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function readSourceFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    if (!parseFlashcardFileName(file.name)) {
      setError('This local importer reads TXT, CSV, TSV, or Markdown. PDF, Office files, and photos need the multimodal agent choice first.');
      return;
    }
    if (file.size > SUPPORTED_SOURCE_BYTES) {
      setError('Please choose a text file under 1 MB.');
      return;
    }
    try {
      setSource(await file.text());
      setDrafts([]);
      setError(null);
    } catch (readError) {
      setError(`Could not read this file: ${messageOf(readError)}`);
    }
  }

  function prepareDrafts(): void {
    const parsed = parseFlashcardText(source);
    if (parsed.length === 0) {
      setError('No Q&A pairs found. Add Q: / A: lines, “Prompt :: Answer” pairs, or a CSV with front/back columns.');
      setDrafts([]);
      return;
    }
    setDrafts(parsed.slice(0, 200));
    setError(parsed.length > 200 ? 'Showing the first 200 pairs so you can review them before saving.' : null);
  }

  function patchDraft(index: number, key: keyof FlashcardDraft, value: string): void {
    setDrafts((current) => current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, [key]: value } : draft)));
  }

  async function saveDrafts(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || drafts.length === 0) return;
    if (drafts.some((draft) => !draft.front.trim() || !draft.back.trim())) {
      setError('Every draft needs both a prompt and answer. Remove incomplete rows or finish editing them.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onImport(drafts, deck.trim() || 'General');
    } catch (importError) {
      setError(messageOf(importError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal titleId="flashcard-import-title" onClose={onClose}>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Private local import</p>
        <h2 id="flashcard-import-title" className="mt-1 text-lg font-semibold text-ink">Draft cards from study text</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">Nothing is saved until you check and add the drafts. Text is processed in this browser only.</p>
      </div>
      <form onSubmit={(event) => void saveDrafts(event)} className="space-y-4">
        <label className="block space-y-1.5 text-xs font-medium text-muted">
          Add drafts to deck
          <input value={deck} onChange={(event) => setDeck(event.target.value)} maxLength={120} placeholder="General" className={inputClass()} />
        </label>
        {drafts.length === 0 ? (
          <>
            <label className="block space-y-1.5 text-xs font-medium text-muted">
              Paste Q&A text
              <textarea value={source} onChange={(event) => setSource(event.target.value)} rows={8} placeholder={'Q: What is spaced repetition?\nA: Reviewing material at increasing intervals.\n\nActive recall :: Retrieving information from memory.'} className={`${inputClass()} min-h-40 resize-y font-mono text-xs`} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-hairline bg-surface-raised px-3 py-2 text-xs font-medium text-ink hover:border-accent/40 hover:text-accent">
                <span aria-hidden>⇧</span> Choose TXT / CSV / TSV / MD
                <input type="file" accept=".txt,.csv,.tsv,.md,text/plain,text/csv,text/markdown" onChange={(event) => void readSourceFile(event)} className="sr-only" aria-label="Choose study text or flashcard CSV" />
              </label>
              <button type="button" onClick={prepareDrafts} disabled={!source.trim()} className="gradient-accent rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm disabled:opacity-50">Review draft cards</button>
            </div>
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              For photos, PDFs, DOCX, or PPTX, I still need the screenshot of the available agents to choose the right multimodal option. This version does not upload files or call an AI service.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-raised px-3 py-2">
              <p className="text-xs font-medium text-ink">Review {drafts.length} draft card{drafts.length === 1 ? '' : 's'}</p>
              <button type="button" onClick={() => setDrafts([])} className="text-[11px] font-medium text-muted hover:text-accent">Back to source</button>
            </div>
            <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
              {drafts.map((draft, index) => (
                <div key={`draft-${index}`} className="grid gap-2 rounded-xl border border-hairline bg-surface-raised/50 p-3 sm:grid-cols-2">
                  <label className="space-y-1 text-[10px] font-medium text-muted">Prompt
                    <textarea rows={3} value={draft.front} onChange={(event) => patchDraft(index, 'front', event.target.value)} className={`${inputClass()} min-h-16 resize-y text-xs`} />
                  </label>
                  <label className="space-y-1 text-[10px] font-medium text-muted">Answer
                    <textarea rows={3} value={draft.back} onChange={(event) => patchDraft(index, 'back', event.target.value)} className={`${inputClass()} min-h-16 resize-y text-xs`} />
                  </label>
                  <button type="button" onClick={() => setDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index))} className="justify-self-start rounded-md px-2 py-1 text-[10px] font-medium text-muted hover:bg-red-500/10 hover:text-red-700">Remove draft</button>
                </div>
              ))}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-muted hover:text-ink disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy || drafts.length === 0} className="gradient-accent rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm">{busy ? 'Adding…' : `Add ${drafts.length} flashcard${drafts.length === 1 ? '' : 's'}`}</button>
            </div>
          </>
        )}
        {error ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">{error}</p> : null}
      </form>
    </Modal>
  );
}

function Modal({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
          className="my-4 w-full max-w-2xl rounded-2xl border border-hairline bg-surface p-5 shadow-2xl sm:p-6"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function inputClass(): string {
  return 'w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm font-normal text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

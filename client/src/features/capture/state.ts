import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Row = { entryId: string; type: "ingreso" | "egreso"; category: string; concept: string; amount: string };
export type LocalDraft = { version: number; rows: Row[] };

type CaptureState = {
  drafts: Record<string, LocalDraft>;
  selected: string | null;
  select: (id: string | null) => void;
  write: (key: string, draft: LocalDraft) => void;
  clear: (key: string) => void;
};

export const useCapture = create<CaptureState>()(persist(
  (set) => ({
    drafts: {}, selected: null,
    select: (selected) => set({ selected }),
    write: (key, draft) => set((state) => ({ drafts: { ...state.drafts, [key]: draft } })),
    clear: (key) => set(({ drafts }) => {
      const remaining = { ...drafts };
      delete remaining[key];
      return { drafts: remaining };
    }),
  }),
  { name: "panaderia-capture-v1", storage: createJSONStorage(() => sessionStorage), partialize: ({ drafts }) => ({ drafts }) },
));

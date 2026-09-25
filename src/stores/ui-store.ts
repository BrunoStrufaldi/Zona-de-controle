import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Estado global de interface (apenas preferências visuais, sem dados de negócio).
 * Persistido no localStorage por ser preferência local da janela; configurações
 * do usuário ficam no SQLite (ver src/services/settings-service.ts).
 */
export type TasksView = "list" | "kanban" | "archived";
export type NotesEditorMode = "edit" | "split" | "preview";

interface UiState {
  /** Sidebar recolhida manualmente pelo usuário (modo desktop). */
  sidebarCollapsed: boolean;
  /** Sidebar aberta como sobreposição em janelas estreitas. */
  sidebarOverlayOpen: boolean;
  /** Grupos da sidebar recolhidos (por id). Ausente = expandido. */
  collapsedGroups: Record<string, boolean>;
  /** Visão preferida na página de Tarefas. */
  tasksView: TasksView;
  /** Modo do editor de notas (texto, lado a lado ou pré-visualização). */
  notesEditorMode: NotesEditorMode;
  toggleSidebar: () => void;
  setSidebarOverlayOpen: (open: boolean) => void;
  toggleGroup: (groupId: string) => void;
  setTasksView: (view: TasksView) => void;
  setNotesEditorMode: (mode: NotesEditorMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarOverlayOpen: false,
      collapsedGroups: {},
      tasksView: "list",
      notesEditorMode: "edit",
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      setSidebarOverlayOpen: (open) => {
        set({ sidebarOverlayOpen: open });
      },
      toggleGroup: (groupId) => {
        set((state) => ({
          collapsedGroups: {
            ...state.collapsedGroups,
            [groupId]: !state.collapsedGroups[groupId],
          },
        }));
      },
      setTasksView: (view) => {
        set({ tasksView: view });
      },
      setNotesEditorMode: (mode) => {
        set({ notesEditorMode: mode });
      },
    }),
    {
      name: "zdc.ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedGroups: state.collapsedGroups,
        tasksView: state.tasksView,
        notesEditorMode: state.notesEditorMode,
      }),
    },
  ),
);

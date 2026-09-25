import { useCallback } from "react";

import { type NoteVersion } from "@/features/productivity/notes/types";
import { type AsyncResource, useAsyncResource } from "@/hooks/use-async-resource";
import { listNoteVersions } from "@/services/notes-service";

/** Histórico de versões de uma nota, mais recentes primeiro. */
export function useNoteVersions(noteId: number): AsyncResource<NoteVersion[]> {
  const load = useCallback(() => listNoteVersions(noteId), [noteId]);
  return useAsyncResource(load);
}

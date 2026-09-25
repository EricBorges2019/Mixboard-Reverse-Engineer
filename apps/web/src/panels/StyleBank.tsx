import { useEffect, useState } from 'react';
import type { StyleArtifact } from '@mixboard/shared';
import { deleteStyle, listStyles } from '../api/client';

/**
 * Saved styles for the project, plus the Create style action.
 * Precondition: `refreshKey` changes whenever a style may have been saved or deleted.
 * Postcondition: lists the project's styles with previews; `Create style` (enabled only when `canCreate`, i.e. at least one image is selected) calls `onCreate`; `Delete` removes a style after confirmation.
 */
export function StyleBank({ projectId, refreshKey, canCreate, onCreate }: { projectId: string; refreshKey: number; canCreate: boolean; onCreate(): void }) {
  const [styles, setStyles] = useState<StyleArtifact[]>([]);
  useEffect(() => {
    let cancelled = false;
    listStyles(projectId).then((s) => { if (!cancelled) setStyles(s); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);
  /**
   * Deletes a style after the user confirms.
   * Precondition: `style` is listed.
   * Postcondition: on confirm the style is deleted server-side and removed from the list.
   */
  async function remove(style: StyleArtifact): Promise<void> {
    if (!window.confirm(`Delete style "${style.name}"?`)) return;
    await deleteStyle(style.id);
    setStyles((prev) => prev.filter((s) => s.id !== style.id));
  }
  return (
    <div className="styles">
      <button disabled={!canCreate} onClick={onCreate} title={canCreate ? '' : 'Select one or more images first'}>Create style from selection</button>
      {styles.length === 0 && <p className="hint">No styles yet. Select images and create one.</p>}
      {styles.map((s) => (
        <div key={s.id} className="style-card">
          {s.hasPreview && <img src={`/api/styles/${s.id}/preview`} alt="" />}
          <strong>{s.name}</strong>
          <pre>{s.content}</pre>
          <button onClick={() => void remove(s)}>Delete</button>
        </div>
      ))}
    </div>
  );
}

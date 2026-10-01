import { useEffect, useState } from 'react';
import type { Board, Project } from '@mixboard/shared';
import { getBoard, getProject } from './api/client';
import { BoardView } from './board/BoardView';
import { BoardList } from './panels/BoardList';
import { useSettings } from './useSettings';

/**
 * Current location hash.
 * Precondition: called from a component.
 * Postcondition: returns `window.location.hash` and re-renders when it changes.
 */
function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    /**
     * Copies the hash into state.
     * Precondition: none.
     * Postcondition: state equals the current hash.
     */
    function onChange(): void {
      setHash(window.location.hash);
    }
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/**
 * Loads a project and opens its first board.
 * Precondition: `projectId` is a project id.
 * Postcondition: renders a loading or error state, then the BoardView once project, board and settings are loaded.
 */
function ProjectView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ project: Project; board: Board } | null>(null);
  const [error, setError] = useState('');
  const { settings, update } = useSettings();
  useEffect(() => {
    setData(null);
    setError('');
    getProject(projectId)
      .then(async ({ project, boards }) => setData({ project, board: await getBoard(boards[0].id) }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [projectId]);
  if (error) return <main className="home"><p className="error">{error}</p><a href="#/">Back to projects</a></main>;
  if (!data || !settings) return <main className="home"><p>Loading…</p></main>;
  return <BoardView key={data.board.id} project={data.project} initialBoard={data.board} settings={settings} updateSettings={update} />;
}

/**
 * The app shell: the project list at `#/`, a board at `#/p/<projectId>`.
 * Precondition: none.
 * Postcondition: renders the view for the current hash; unknown hashes show the project list.
 */
export function App() {
  const hash = useHash();
  const match = /^#\/p\/([^/]+)$/.exec(hash);
  return match ? <ProjectView projectId={match[1]} /> : <BoardList />;
}

import { useEffect, useState } from 'react';
import type { Project } from '@mixboard/shared';
import { createProject, fileUrl, listProjects } from '../api/client';

/**
 * Home screen: all projects with thumbnails and a New project button.
 * Precondition: the server is reachable.
 * Postcondition: clicking a project opens `#/p/<id>`; `New project` creates one and opens it.
 */
export function BoardList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    listProjects().then(setProjects).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  /**
   * Creates a project and navigates to it.
   * Precondition: none.
   * Postcondition: the location hash points at the new project, or the error is shown.
   */
  async function create(): Promise<void> {
    try {
      const { project } = await createProject();
      window.location.hash = `#/p/${project.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <main className="home">
      <h1>Mixboard</h1>
      <button onClick={() => void create()}>New project</button>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {projects?.map((p) => (
          <a key={p.id} className="card" href={`#/p/${p.id}`}>
            {p.thumbnailResourceId ? <img src={fileUrl(p.thumbnailResourceId)} alt="" /> : <div className="placeholder" />}
            <span>{p.title}</span>
          </a>
        ))}
      </div>
    </main>
  );
}

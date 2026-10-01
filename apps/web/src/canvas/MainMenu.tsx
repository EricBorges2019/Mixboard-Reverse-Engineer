import { createContext, useContext } from 'react';
import { DefaultMainMenu, TldrawUiMenuGroup, TldrawUiMenuItem, type TLUiTranslationKey } from 'tldraw';

/** Leaves the board for the project list; provided by BoardView, which knows whether the agent is busy. */
export const LeaveBoardContext = createContext<() => void>(() => {});

/** Menu labels, registered as tldraw translations (tldraw menu items take translation keys, not text). */
export const MENU_TRANSLATIONS = { 'mb.all-projects': 'All projects' };

/**
 * The ☰ menu at the top left, with the clone's own items instead of tldraw's defaults.
 * Precondition: rendered by tldraw as the MainMenu component, under a LeaveBoardContext provider; MENU_TRANSLATIONS are registered.
 * Postcondition: shows "All projects", which calls the context's leave function.
 */
export function MainMenu() {
  const leave = useContext(LeaveBoardContext);
  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="mb-navigation">
        {/* tldraw types labels as its own closed set of keys; ours is registered through MENU_TRANSLATIONS. */}
        <TldrawUiMenuItem id="mb-all-projects" label={'mb.all-projects' as TLUiTranslationKey} readonlyOk onSelect={leave} />
      </TldrawUiMenuGroup>
    </DefaultMainMenu>
  );
}

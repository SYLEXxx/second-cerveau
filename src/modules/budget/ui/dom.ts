export const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

export function setText(id: string, text: string | number): void {
  const el = byId(id);
  if (el) el.textContent = String(text);
}

export function on<K extends keyof HTMLElementEventMap>(
  id: string,
  type: K,
  handler: (e: HTMLElementEventMap[K]) => void,
): void {
  byId(id)?.addEventListener(type, handler as EventListener);
}

/** Classes alternées d'un bouton bascule (Électrique/Thermique, OUI/NON...). */
export function toggleClasses(el: Element | null, active: boolean, classes: string[]): void {
  classes.forEach((c) => el?.classList.toggle(c, active));
}

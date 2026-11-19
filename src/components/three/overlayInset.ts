/** Keep projected labels and handles clear of the scene toolbar, including while orbit hides it. */
export function overlayTopInset(element: HTMLElement, canvasTop: number): number {
  const tools = element.closest('[data-phone-three]')?.querySelector('.mobile-scene-tools');
  return tools ? Math.max(0, tools.getBoundingClientRect().bottom - canvasTop) : 0;
}

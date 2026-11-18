/** DOM annotations use canvas coordinates. Reserve the phone bars' space even while they're hidden. */
export function overlayTopInset(element: HTMLElement, canvasTop: number): number {
  const phone = element.closest('[data-phone-three]');
  const header = phone?.querySelector(':scope > header');
  return header ? Math.max(0, header.getBoundingClientRect().bottom - canvasTop) : 0;
}

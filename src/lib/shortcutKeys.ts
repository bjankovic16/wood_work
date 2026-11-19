export function shortcutKeys(platform = typeof navigator === 'undefined' ? '' : navigator.platform) {
  const apple = /Mac|iPhone|iPad|iPod/i.test(platform);
  const mod = apple ? '⌘' : 'Ctrl';
  return { undo: [mod, 'Z'], redo: apple ? [mod, 'Shift', 'Z'] : [mod, 'Y'], duplicate: [mod, 'D'], delete: apple ? '⌫' : 'Del' };
}

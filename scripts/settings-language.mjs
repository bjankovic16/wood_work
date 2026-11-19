/** Switch through the same Settings control on a laptop or phone. */
export async function chooseLanguage(page, language) {
  const header = page.getByRole('banner');
  if (page.viewportSize().width < 1024) await header.getByRole('button', { name: /^(More|Više)$/ }).click();
  await header.getByRole('button', { name: /^(Settings|Podešavanja)$/ }).click();
  const dialog = page.getByRole('dialog', { name: /^(Settings|Podešavanja)$/ });
  await dialog.getByLabel('Jezik / Language').selectOption(language);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
}

import { useUiStore } from '../../store/uiStore';

const planMessages = {
  en: { fit: 'Fit', pinch: 'Pinch with two fingers to zoom.', allDimensions: 'Show all plan dimensions' },
  sr: { fit: 'Uklopi', pinch: 'Približite ili razmaknite dva prsta za zumiranje.', allDimensions: 'Prikaži sve kote osnove' },
};

export function usePlanMessages() {
  return planMessages[useUiStore((state) => state.language)];
}

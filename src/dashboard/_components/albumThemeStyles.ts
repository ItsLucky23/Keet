export const getAlbumThemeClasses = (theme: string): string => {
  if (theme === 'carnaval') return 'bg-correct/20 border-correct';
  if (theme === 'koningsdag') return 'bg-warning/20 border-warning';
  if (theme === 'zomer') return 'bg-primary/20 border-primary';
  if (theme === 'winter') return 'bg-container2 border-container2-border';
  if (theme === 'halloween') return 'bg-wrong/20 border-wrong';
  return 'bg-container1 border-container1-border';
};
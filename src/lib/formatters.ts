export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

export function formatDateNL(dateString: string): string {
  return new Date(dateString).toLocaleDateString("nl-NL", {
    day: "numeric", month: "short", year: "numeric"
  });
}

export function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
}

export function formatDateWeekday(dateString: string): string {
  return new Date(dateString).toLocaleDateString("nl-NL", {
    weekday: "short", day: "numeric", month: "short"
  });
}

export function formatTimeNL(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("nl-NL", {
    hour: "2-digit", minute: "2-digit"
  });
}

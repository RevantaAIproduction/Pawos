export function getLocalTimeOfDayHours(now: Date = new Date()): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}


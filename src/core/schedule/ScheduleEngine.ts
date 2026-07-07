export type ScheduleCategory = string;

export type ScheduleEntry = {
  // minutes since midnight
  startMinute: number;
  endMinute?: number; // if omitted, runs until next entry
  category: ScheduleCategory;
};

export type CompanionSchedule = {
  companionId: string;
  entries: ScheduleEntry[];
};

export class ScheduleEngine {
  getActiveCategory(schedule: CompanionSchedule, now: Date = new Date()): ScheduleCategory {
    const minute = now.getHours() * 60 + now.getMinutes();
    const sorted = [...schedule.entries].sort((a, b) => a.startMinute - b.startMinute);

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const end = cur.endMinute ?? next?.startMinute;

      if (end === undefined) {
        if (minute >= cur.startMinute) return cur.category;
      } else {
        if (minute >= cur.startMinute && minute < end) return cur.category;
      }
    }

    // fallback: first entry
    return sorted[0]?.category ?? 'idle';
  }
}


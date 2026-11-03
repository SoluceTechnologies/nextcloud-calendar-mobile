export type Account = {
    id: string;
    displayName: string;
    baseUrl: string;
    username: string;
    appPassword: string;
    davUserId: string;
    timezone?: string;
    email?: string;
};

export type CalendarMeta = {
    id: string;
    accountId: string;
    displayName: string;
    color: string;
    ctag: string;
    url: string;
    slug: string;
    isSubscribed?: boolean;
    isReadOnly?: boolean;
    sourceUrl?: string;
    supportsEvents?: boolean;
    order?: number;
    isShared?: boolean;
};

export type Attendee = {
    email: string;
    displayName?: string;
};

export type FreeBusyType = 'BUSY' | 'BUSY-UNAVAILABLE' | 'BUSY-TENTATIVE' | 'FREE';

export type BusySlot = {
    start: Date;
    end: Date;
    fbType: FreeBusyType;
    /** Emails of the attendees whose schedules occupy this slot. */
    attendees?: string[];
};

export type AttendeeAvailability = {
    email: string;
    displayName?: string;
    slots: BusySlot[];
    available: boolean;
    /** Deterministic color assigned to this attendee for the timeline. */
    color: string;
    /** Whether this attendee is treated as required in permissive mode. */
    required?: boolean;
};

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type RecurrenceRule = {
    freq: RecurrenceFreq;
    interval?: number;
    count?: number;
    until?: Date;
    byDay?: string[];
    byMonth?: number[];
    byWeekNo?: number[];
};

export type RecurrenceEditScope = 'this' | 'thisAndFollowing' | 'all';

export type TalkRoomType = 'public' | 'private';

export type TalkOpenMode = 'app' | 'browser' | 'ask';

export type EventTransp = 'opaque' | 'transparent';

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

export type CalendarEvent = {
    uid: string;
    href: string;
    calendarId: string;
    accountId: string;
    summary: string;
    description?: string;
    location?: string;
    dtstart: Date;
    dtend: Date;
    allDay: boolean;
    color: string;
    attendees: Attendee[];
    organizerEmail?: string;
    talkUrl?: string;
    isRecurring: boolean;
    rrule?: string;
    recurrenceId?: Date;
    alarms?: number[];
    isTask?: boolean;
    readOnly?: boolean;
    transp?: EventTransp;
    status?: EventStatus;
};

export type CreateEventInput = {
    summary: string;
    calendarId: string;
    dtstart: Date;
    dtend: Date;
    allDay: boolean;
    description?: string;
    location?: string;
    attendees: Attendee[];
    withTalkRoom: boolean;
    talkRoomType?: TalkRoomType;
    organizerEmail: string;
    organizerName: string;
    rrule?: RecurrenceRule;
    alarms?: number[];
    transp?: EventTransp;
    status?: EventStatus;
};

export type CalendarAppStatus = 'unknown' | 'available' | 'unconfigured';

export type TaskTypeSlotShape = {
    name: string;
    description: string;
    /** ShapeEnum — int on older NC, enum name string on newer ones. */
    type: number | string;
    mandatory: boolean;
};

export type TaskTypeInfo = {
    name: string;
    description: string;
    inputShape: Record<string, TaskTypeSlotShape>;
    outputShape: Record<string, TaskTypeSlotShape>;
    optionalInputShape?: Record<string, TaskTypeSlotShape>;
    inputShapeEnumValues?: Record<string, { name: string; value: string | number }[]>;
    isInternal?: boolean;
};

export type TaskProcessingStatus = 0 | 1 | 2 | 3 | 4 | 5;
// 0 unknown, 1 scheduled, 2 running, 3 successful, 4 failed, 5 cancelled

export type TaskProcessingTask = {
    id: number;
    type: string;
    status: TaskProcessingStatus;
    input?: Record<string, unknown>;
    output?: Record<string, unknown> | null;
    message?: string;
    userId?: string;
    appId?: string;
    customId?: string;
};

export type ServerCapabilities = {
    talkEnabled: boolean;
    calendarApp: CalendarAppStatus;
    taskTypes?: Record<string, TaskTypeInfo>;
};

export type ViewMode = 'month' | 'week' | '3days' | 'day' | 'schedule';

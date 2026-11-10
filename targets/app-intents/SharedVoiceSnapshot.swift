import Foundation

// Reads the agenda snapshot the app mirrors into the shared app-group
// UserDefaults (see src/services/shared/appGroupStorage.ts — key
// "voice.agendaSnapshot"). Written by the widget sync, so the data is as fresh
// as the last app sync; Siri intents speak it as-is.

private let appGroupId = "group.com.soluce.nextcloud-calendar"
private let voiceEnabledKey = "voice.enabled"
private let snapshotKey = "voice.agendaSnapshot"

struct SharedAgendaEvent: Codable {
  let title: String
  let timeLabel: String
  let startIso: String
  let endIso: String
  let allDay: Bool
}

struct SharedAgendaSection: Codable {
  let isToday: Bool
  let weekdayLong: String
  let dayNumber: String
  let dayKey: String
  let items: [SharedAgendaEvent]
  let totalCount: Int?
}

struct SharedAgendaSnapshot: Codable {
  let generatedAtIso: String
  let timeZone: String?
  let locale: String?
  let relativeLabel: String
  let sections: [SharedAgendaSection]
  let nextEvent: SharedAgendaEvent?
}

enum SharedVoiceData {
  static var voiceEnabled: Bool {
    UserDefaults(suiteName: appGroupId)?.string(forKey: voiceEnabledKey) == "1"
  }

  static var snapshot: SharedAgendaSnapshot? {
    guard let raw = UserDefaults(suiteName: appGroupId)?.string(forKey: snapshotKey),
          let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(SharedAgendaSnapshot.self, from: data)
  }

  /// Today's zoned key (yyyy-MM-dd, same en-CA format the writer uses).
  static func todayKey(in timeZone: String?) -> String {
    let fmt = DateFormatter()
    fmt.dateFormat = "yyyy-MM-dd"
    fmt.timeZone = timeZone.flatMap { TimeZone(identifier: $0) } ?? .current
    return fmt.string(from: Date())
  }

  /// The "today" section is only trustworthy while its dayKey is still today —
  /// widget background refresh isn't guaranteed, so a stale snapshot could
  /// otherwise speak yesterday's agenda as today's.
  static var todaySection: SharedAgendaSection? {
    guard let snap = snapshot else { return nil }
    return snap.sections.first {
      $0.isToday && $0.dayKey == todayKey(in: snap.timeZone)
    }
  }

  /// First not-yet-ended item across sections — the stored `nextEvent` alone
  /// can't detect that it elapsed since the snapshot was written.
  static var nextUpcomingEvent: SharedAgendaEvent? {
    guard let snap = snapshot else { return nil }
    let now = Date()
    let iso = ISO8601DateFormatter()
    return snap.sections.flatMap { $0.items }.first { item in
      guard let end = iso.date(from: item.endIso) else { return true }
      return end > now
    }
  }

  /// Bilingual phrasing — the snapshot carries the app locale, which is what
  /// the user actually hears from the app; fall back to device locale.
  static func speak(_ en: String, _ fr: String, locale: String? = nil) -> String {
    let code = locale ?? snapshot?.locale ?? Locale.current.languageCode ?? "en"
    return code.hasPrefix("fr") ? fr : en
  }
}

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
}

struct SharedAgendaSection: Codable {
  let isToday: Bool
  let weekdayLong: String
  let dayNumber: String
  let items: [SharedAgendaEvent]
}

struct SharedAgendaSnapshot: Codable {
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

  static var todaySection: SharedAgendaSection? {
    snapshot?.sections.first(where: { $0.isToday })
  }

  /// Bilingual phrasing — the snapshot carries the app locale, which is what
  /// the user actually hears from the app; fall back to device locale.
  static func speak(_ en: String, _ fr: String, locale: String? = nil) -> String {
    let code = locale ?? snapshot?.locale ?? Locale.current.languageCode ?? "en"
    return code.hasPrefix("fr") ? fr : en
  }
}

import AppIntents
import UIKit

// Siri / App Shortcuts surface for the voice assistant. Read intents answer
// from the shared agenda snapshot (no UI needed — works hands-free, including
// in CarPlay). Open intents deep-link into the app for anything interactive
// (the conversational sheet, the server agent).

private func voiceEnabled() -> Bool {
  SharedVoiceData.voiceEnabled
}

private var voiceOffDialog: String {
  SharedVoiceData.speak(
    "Enable the voice assistant in the Calendar settings first.",
    "Activez d'abord l'assistant vocal dans les réglages de l'app."
  )
}

private var noDataDialog: String {
  SharedVoiceData.speak(
    "Open Calendar once so I can read your agenda.",
    "Ouvrez l'app une fois pour que je puisse lire votre agenda."
  )
}

@available(iOS 16.0, *)
struct NextEventIntent: AppIntent {
  static var title: LocalizedStringResource = "Next event"
  static var description = IntentDescription("Reads the next event in your Nextcloud calendar.")

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard voiceEnabled() else { return .result(dialog: IntentDialog(stringLiteral: voiceOffDialog)) }
    guard let next = SharedVoiceData.nextUpcomingEvent else {
      guard SharedVoiceData.snapshot != nil else { return .result(dialog: IntentDialog(stringLiteral: noDataDialog)) }
      return .result(dialog: IntentDialog(stringLiteral: SharedVoiceData.speak(
        "Nothing coming up on your calendar.",
        "Rien de prévu dans votre agenda."
      )))
    }
    return .result(dialog: IntentDialog(stringLiteral: SharedVoiceData.speak(
      "Next up: \(next.title), \(next.timeLabel).",
      "Prochain rendez-vous : \(next.title), \(next.timeLabel)."
    )))
  }
}

@available(iOS 16.0, *)
struct TodayAgendaIntent: AppIntent {
  static var title: LocalizedStringResource = "Today's agenda"
  static var description = IntentDescription("Summarizes today's events in your Nextcloud calendar.")

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard voiceEnabled() else { return .result(dialog: IntentDialog(stringLiteral: voiceOffDialog)) }
    guard SharedVoiceData.snapshot != nil else { return .result(dialog: IntentDialog(stringLiteral: noDataDialog)) }
    // Snapshot exists but its "today" is stale → don't speak yesterday's agenda.
    guard let section = SharedVoiceData.todaySection else {
      return .result(dialog: IntentDialog(stringLiteral: SharedVoiceData.speak(
        "My agenda data is out of date — open Calendar once to refresh it.",
        "Mes données d'agenda sont trop anciennes — ouvrez l'app pour les actualiser."
      )))
    }
    let items = section.items
    if items.isEmpty {
      return .result(dialog: IntentDialog(stringLiteral: SharedVoiceData.speak(
        "Nothing scheduled today.",
        "Rien de prévu aujourd'hui."
      )))
    }
    let first = items[0]
    // items is truncated at maxPerSection — totalCount carries the real total.
    let count = section.totalCount ?? items.count
    return .result(dialog: IntentDialog(stringLiteral: SharedVoiceData.speak(
      "You have \(count) event\(count == 1 ? "" : "s") today, starting with \(first.title) at \(first.timeLabel).",
      "Vous avez \(count) événement\(count == 1 ? "" : "s") aujourd'hui, à commencer par \(first.title) à \(first.timeLabel)."
    )))
  }
}

@available(iOS 16.0, *)
struct OpenVoiceAssistantIntent: AppIntent {
  static var title: LocalizedStringResource = "Talk to the calendar assistant"
  static var description = IntentDescription("Opens the voice assistant sheet, listening.")
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    let url = URL(string: "nextcloud-calendar://listen?mode=voice")!
    await MainActor.run { UIApplication.shared.open(url) }
    return .result()
  }
}

@available(iOS 16.0, *)
struct AskAssistantIntent: AppIntent {
  static var title: LocalizedStringResource = "Ask the calendar assistant"
  static var description = IntentDescription("Sends a free-form request to the Nextcloud calendar assistant.")

  @Parameter(title: "Request", requestValueDialog: IntentDialog("What would you like to ask your calendar assistant?"))
  var request: String

  static var parameterSummary: some ParameterSummary {
    Summary(\.$request)
  }

  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    var comps = URLComponents(string: "nextcloud-calendar://listen")!
    comps.queryItems = [
      URLQueryItem(name: "mode", value: "voice"),
      URLQueryItem(name: "say", value: request),
    ]
    await MainActor.run { UIApplication.shared.open(comps.url!) }
    return .result()
  }
}

@available(iOS 16.0, *)
struct CreateEventIntent: AppIntent {
  static var title: LocalizedStringResource = "New event"
  static var description = IntentDescription("Opens a pre-filled event form — you review and save it.")

  @Parameter(title: "Title", requestValueDialog: IntentDialog("What's the title of the event?"))
  var eventTitle: String

  @Parameter(title: "Date and time", requestValueDialog: IntentDialog("When is the event?"))
  var date: Date?

  static var parameterSummary: some ParameterSummary {
    Summary("New event \(\.$eventTitle) \(\.$date)")
  }

  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    var comps = URLComponents(string: "nextcloud-calendar://event/new")!
    var items = [URLQueryItem(name: "title", value: eventTitle)]
    if let date {
      items.append(URLQueryItem(name: "date", value: ISO8601DateFormatter().string(from: date)))
    }
    comps.queryItems = items
    await MainActor.run { UIApplication.shared.open(comps.url!) }
    return .result()
  }
}

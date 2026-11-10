import AppIntents

// App Shortcuts registered at install time — these are what Siri matches in
// "Hey Siri, …" including in CarPlay. Phrases are listed per language; the
// \(.applicationName) token is mandatory placement (start or end).

@available(iOS 16.0, *)
struct VoiceShortcuts: AppShortcutsProvider {
  @AppShortcutsBuilder
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: NextEventIntent(),
      phrases: [
        "Next event in \(.applicationName)",
        "What's my next event in \(.applicationName)",
        "Prochain rendez-vous dans \(.applicationName)",
        "Prochain événement dans \(.applicationName)",
      ],
      shortTitle: "Next event",
      systemImageName: "calendar"
    )
    AppShortcut(
      intent: TodayAgendaIntent(),
      phrases: [
        "Today's agenda in \(.applicationName)",
        "What do I have today in \(.applicationName)",
        "Agenda du jour dans \(.applicationName)",
        "Qu'est-ce que j'ai aujourd'hui dans \(.applicationName)",
      ],
      shortTitle: "Today's agenda",
      systemImageName: "calendar.day.timeline.left"
    )
    AppShortcut(
      intent: OpenVoiceAssistantIntent(),
      phrases: [
        "Talk to \(.applicationName)",
        "Open the voice assistant in \(.applicationName)",
        "Parle à \(.applicationName)",
        "Ouvre l'assistant vocal dans \(.applicationName)",
      ],
      shortTitle: "Voice assistant",
      systemImageName: "mic"
    )
    AppShortcut(
      intent: AskAssistantIntent(),
      phrases: [
        "Ask \(.applicationName)",
        "Demande à \(.applicationName)",
      ],
      shortTitle: "Ask assistant",
      systemImageName: "mic.badge.plus"
    )
    AppShortcut(
      intent: CreateEventIntent(),
      phrases: [
        "New event in \(.applicationName)",
        "Create an event in \(.applicationName)",
        "Nouvel événement dans \(.applicationName)",
        "Crée un événement dans \(.applicationName)",
      ],
      shortTitle: "New event",
      systemImageName: "calendar.badge.plus"
    )
  }

  static var shortcutTileColor: ShortcutTileColor {
    .blue
  }
}

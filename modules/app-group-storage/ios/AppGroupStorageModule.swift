import ExpoModulesCore

// String key/value store backed by UserDefaults(suiteName:) so the app and
// shareable surfaces (App Intents, widget extension) read the same data.
public class AppGroupStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupStorage")

    Function("setString") { (suite: String, key: String, value: String) in
      UserDefaults(suiteName: suite)?.set(value, forKey: key)
    }

    Function("getString") { (suite: String, key: String) -> String? in
      UserDefaults(suiteName: suite)?.string(forKey: key)
    }

    Function("remove") { (suite: String, key: String) in
      UserDefaults(suiteName: suite)?.removeObject(forKey: key)
    }
  }
}

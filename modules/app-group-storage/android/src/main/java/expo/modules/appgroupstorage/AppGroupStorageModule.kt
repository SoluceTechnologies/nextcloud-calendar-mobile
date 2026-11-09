package expo.modules.appgroupstorage

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Same API surface as iOS — backed by a named SharedPreferences file. Nothing
// reads it natively today, but keeping parity avoids platform guards in JS.
class AppGroupStorageModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private fun prefs(suite: String) = context.getSharedPreferences(suite, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("AppGroupStorage")

    Function("setString") { suite: String, key: String, value: String ->
      prefs(suite).edit().putString(key, value).apply()
    }

    Function("getString") { suite: String, key: String ->
      prefs(suite).getString(key, null)
    }

    Function("remove") { suite: String, key: String ->
      prefs(suite).edit().remove(key).apply()
    }
  }
}

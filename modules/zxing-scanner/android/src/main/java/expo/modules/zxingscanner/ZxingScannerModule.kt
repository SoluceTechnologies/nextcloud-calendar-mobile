package expo.modules.zxingscanner

import android.Manifest
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZxingScannerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ZxingScanner")

        AsyncFunction("getCameraPermissionsAsync") { promise: Promise ->
            Permissions.getPermissionsWithPermissionsManager(
                appContext.permissions,
                promise,
                Manifest.permission.CAMERA,
            )
        }

        AsyncFunction("requestCameraPermissionsAsync") { promise: Promise ->
            Permissions.askForPermissionsWithPermissionsManager(
                appContext.permissions,
                promise,
                Manifest.permission.CAMERA,
            )
        }

        View(ZxingScannerView::class) {
            Events("onBarcodeScanned")

            Prop("paused") { view: ZxingScannerView, paused: Boolean ->
                view.paused = paused
            }

            Prop("torch") { view: ZxingScannerView, torch: Boolean ->
                view.setTorch(torch)
            }
        }
    }
}

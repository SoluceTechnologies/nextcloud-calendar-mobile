package expo.modules.zxingscanner

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import android.util.Size
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

private const val TAG = "ZxingScannerView"

private const val DUPLICATE_WINDOW_MS = 1_500L

class ZxingScannerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onBarcodeScanned by EventDispatcher()

  private val previewView = PreviewView(context).also {
    it.scaleType = PreviewView.ScaleType.FILL_CENTER
    addView(it)
  }

  private val analysisExecutor = Executors.newSingleThreadExecutor()

  private val reader = MultiFormatReader().apply {
    setHints(
      mapOf(
        DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
        DecodeHintType.TRY_HARDER to true,
      ),
    )
  }

  private var cameraProvider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var torchEnabled = false
  private var lastText: String? = null
  private var lastEmittedAt = 0L

  var paused: Boolean = false

  fun setTorch(enabled: Boolean) {
    torchEnabled = enabled
    camera?.cameraControl?.enableTorch(enabled)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    startCamera()
  }

  override fun onDetachedFromWindow() {
    stopCamera()
    super.onDetachedFromWindow()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val width = right - left
    val height = bottom - top
    previewView.measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
    )
    previewView.layout(0, 0, width, height)
  }

  private fun startCamera() {
    val lifecycleOwner = appContext.currentActivity as? LifecycleOwner
    if (lifecycleOwner == null) {
      Log.e(TAG, "No LifecycleOwner activity available, camera not started")
      return
    }

    val providerFuture = ProcessCameraProvider.getInstance(context)
    providerFuture.addListener({
      val provider = try {
        providerFuture.get()
      } catch (e: Exception) {
        Log.e(TAG, "Failed to get camera provider", e)
        return@addListener
      }
      cameraProvider = provider

      val preview = Preview.Builder().build().also {
        it.surfaceProvider = previewView.surfaceProvider
      }

      val analysis = ImageAnalysis.Builder()
        .setResolutionSelector(
          ResolutionSelector.Builder()
            .setResolutionStrategy(
              ResolutionStrategy(
                Size(1280, 720),
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
              ),
            )
            .build(),
        )
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()
        .also { it.setAnalyzer(analysisExecutor, ::analyze) }

      try {
        provider.unbindAll()
        camera = provider.bindToLifecycle(
          lifecycleOwner,
          CameraSelector.DEFAULT_BACK_CAMERA,
          preview,
          analysis,
        )
        camera?.cameraControl?.enableTorch(torchEnabled)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to bind camera use cases", e)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun stopCamera() {
    cameraProvider?.unbindAll()
    cameraProvider = null
    camera = null
    analysisExecutor.shutdown()
  }

  @SuppressLint("UnsafeOptInUsageError")
  private fun analyze(image: ImageProxy) {
    try {
      if (paused) return

      val text = decode(image) ?: return

      val now = System.currentTimeMillis()
      if (text == lastText && now - lastEmittedAt < DUPLICATE_WINDOW_MS) return
      lastText = text
      lastEmittedAt = now

      post { onBarcodeScanned(mapOf("data" to text)) }
    } finally {
      image.close()
    }
  }

  private fun decode(image: ImageProxy): String? {
    val plane = image.planes[0]
    val buffer = plane.buffer
    val data = ByteArray(buffer.remaining())
    buffer.get(data)

    val source = PlanarYUVLuminanceSource(
      data,
      plane.rowStride,
      image.height,
      0,
      0,
      image.width,
      image.height,
      false,
    )

    return try {
      reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
    } catch (e: Exception) {
      null
    } finally {
      reader.reset()
    }
  }
}

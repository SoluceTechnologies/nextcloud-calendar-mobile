package expo.modules.tlstrust

import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.internal.tls.OkHostnameVerifier
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

class UntrustedCertException(val cert: X509Certificate) : CertificateException()

internal fun shouldSkipHostnameVerification(pinned: Set<String>, leafSha256: String?): Boolean =
  leafSha256 != null && pinned.contains(leafSha256)

class TlsTrustModule : Module() {
  private val pins = ConcurrentHashMap<String, Set<String>>()

  private val defaultTrust: X509TrustManager by lazy {
    val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    tmf.init(null as java.security.KeyStore?)
    tmf.trustManagers.first { it is X509TrustManager } as X509TrustManager
  }

  private fun sha256Hex(cert: X509Certificate): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(cert.encoded)
    return digest.joinToString(":") { "%02X".format(it) }
  }

  private fun hostKey(url: HttpUrl): String {
    val port = if (url.port != -1) url.port else if (url.scheme == "https") 443 else 80
    return "${url.host}:$port"
  }

  private fun iso(date: java.util.Date): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
    fmt.timeZone = TimeZone.getTimeZone("UTC")
    return fmt.format(date)
  }

  private fun clientFor(hostKey: String): OkHttpClient {
    val pinned = pins[hostKey] ?: emptySet()
    val trustManager = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        val leaf = chain.first()
        if (pinned.contains(sha256Hex(leaf))) return
        try {
          defaultTrust.checkServerTrusted(chain, authType)
        } catch (e: CertificateException) {
          throw UntrustedCertException(leaf)
        }
      }
      override fun getAcceptedIssuers(): Array<X509Certificate> = defaultTrust.acceptedIssuers
    }
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(null, arrayOf<TrustManager>(trustManager), null)
    return OkHttpClient.Builder()
      .sslSocketFactory(sslContext.socketFactory, trustManager)
      .hostnameVerifier(
        HostnameVerifier { hostname, session ->
          val leafSha = try {
            (session.peerCertificates.firstOrNull() as? X509Certificate)?.let { sha256Hex(it) }
          } catch (e: Exception) {
            null
          }
          if (shouldSkipHostnameVerification(pinned, leafSha)) true
          else OkHostnameVerifier.verify(hostname, session)
        }
      )
      .build()
  }

  override fun definition() = ModuleDefinition {
    Name("TlsTrust")

    Function("setPins") { map: Map<String, List<String>> ->
      pins.clear()
      map.forEach { (host, list) -> pins[host] = list.map { it.uppercase() }.toSet() }
    }

    AsyncFunction("request") { params: Map<String, Any?>, promise: Promise ->
      try {
        val urlStr = params["url"] as String
        val method = params["method"] as? String ?: "GET"
        @Suppress("UNCHECKED_CAST")
        val headers = (params["headers"] as? Map<String, String>) ?: emptyMap()
        val bodyB64 = params["bodyBase64"] as? String
        val timeoutMs = (params["timeoutMs"] as? Number)?.toLong() ?: 20000L

        val httpUrl = urlStr.toHttpUrl()
        val hostKey = hostKey(httpUrl)
        val client = clientFor(hostKey).newBuilder()
          .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
          .build()

        val body = bodyB64?.let { Base64.decode(it, Base64.DEFAULT).toRequestBody(null) }
        val builder = Request.Builder().url(httpUrl).method(method, body)
        headers.forEach { (k, v) -> builder.addHeader(k, v) }

        client.newCall(builder.build()).execute().use { resp ->
          val bytes = resp.body?.bytes() ?: ByteArray(0)
          val responseHeaders = HashMap<String, String>()
          resp.headers.forEach { responseHeaders[it.first] = it.second }
          promise.resolve(
            mapOf(
              "type" to "response",
              "status" to resp.code,
              "headers" to responseHeaders,
              "bodyBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP),
            )
          )
        }
      } catch (e: Exception) {
        val untrusted = generateSequence(e as Throwable?) { it.cause }
          .firstOrNull { it is UntrustedCertException } as? UntrustedCertException
        if (untrusted != null) {
          val cert = untrusted.cert
          val httpUrl = (params["url"] as String).toHttpUrl()
          promise.resolve(
            mapOf(
              "type" to "untrusted_cert",
              "host" to hostKey(httpUrl),
              "sha256" to sha256Hex(cert),
              "subject" to cert.subjectDN.name,
              "issuer" to cert.issuerDN.name,
              "notBefore" to iso(cert.notBefore),
              "notAfter" to iso(cert.notAfter),
            )
          )
        } else {
          promise.reject("REQUEST_FAILED", e.message ?: "request failed", e)
        }
      }
    }
  }
}

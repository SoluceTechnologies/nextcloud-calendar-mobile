import ExpoModulesCore
import CryptoKit

struct UntrustedInfo {
  let sha256: String
  let subject: String
  let issuer: String
  let notBefore: String
  let notAfter: String
}

public class TlsTrustModule: Module {
  private var pins: [String: Set<String>] = [:]
  private let pinsQueue = DispatchQueue(label: "tls-trust.pins")

  public func definition() -> ModuleDefinition {
    Name("TlsTrust")

    Function("setPins") { (map: [String: [String]]) in
      self.pinsQueue.sync {
        self.pins = map.mapValues { Set($0.map { $0.uppercased() }) }
      }
    }

    AsyncFunction("request") { (params: [String: Any], promise: Promise) in
      guard let urlStr = params["url"] as? String, let url = URL(string: urlStr) else {
        promise.reject("REQUEST_FAILED", "invalid url")
        return
      }
      let method = (params["method"] as? String) ?? "GET"
      let headers = (params["headers"] as? [String: String]) ?? [:]
      let bodyB64 = params["bodyBase64"] as? String
      let timeoutMs = (params["timeoutMs"] as? Double) ?? 20000

      var req = URLRequest(url: url)
      req.httpMethod = method
      req.timeoutInterval = timeoutMs / 1000.0
      for (key, value) in headers { req.setValue(value, forHTTPHeaderField: key) }
      if let b = bodyB64, let data = Data(base64Encoded: b) { req.httpBody = data }

      let hostKey = self.hostKey(url)
      let pinned = self.pinsQueue.sync { self.pins[hostKey] ?? [] }
      let delegate = TrustDelegate(pinned: pinned)
      let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)

      let task = session.dataTask(with: req) { data, response, error in
        defer { session.finishTasksAndInvalidate() }

        if let untrusted = delegate.untrusted {
          promise.resolve([
            "type": "untrusted_cert",
            "host": hostKey,
            "sha256": untrusted.sha256,
            "subject": untrusted.subject,
            "issuer": untrusted.issuer,
            "notBefore": untrusted.notBefore,
            "notAfter": untrusted.notAfter,
          ])
          return
        }
        if let error = error {
          promise.reject("REQUEST_FAILED", error.localizedDescription)
          return
        }
        guard let http = response as? HTTPURLResponse else {
          promise.reject("REQUEST_FAILED", "no response")
          return
        }
        var responseHeaders: [String: String] = [:]
        for (k, v) in http.allHeaderFields {
          if let ks = k as? String, let vs = v as? String { responseHeaders[ks] = vs }
        }
        promise.resolve([
          "type": "response",
          "status": http.statusCode,
          "headers": responseHeaders,
          "bodyBase64": (data ?? Data()).base64EncodedString(),
        ])
      }
      task.resume()
    }
  }

  private func hostKey(_ url: URL) -> String {
    let host = url.host ?? ""
    let port = url.port ?? (url.scheme == "https" ? 443 : 80)
    return "\(host):\(port)"
  }
}

final class TrustDelegate: NSObject, URLSessionDelegate {
  private let pinned: Set<String>
  var untrusted: UntrustedInfo?

  init(pinned: Set<String>) { self.pinned = pinned }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let trust = challenge.protectionSpace.serverTrust else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    let leaf: SecCertificate?
    if #available(iOS 15.0, *) {
      leaf = (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first
    } else {
      leaf = SecTrustGetCertificateAtIndex(trust, 0)
    }
    guard let cert = leaf else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    let der = SecCertificateCopyData(cert) as Data
    let digest = SHA256.hash(data: der).map { String(format: "%02X", $0) }.joined(separator: ":")

    // Pinned fingerprint: accept, bypassing system + hostname/SAN evaluation.
    if pinned.contains(digest) {
      completionHandler(.useCredential, URLCredential(trust: trust))
      return
    }

    // Otherwise fall back to normal system trust evaluation.
    var evalError: CFError?
    if SecTrustEvaluateWithError(trust, &evalError) {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    // Untrusted: capture the leaf details and fail the challenge. (subject via
    // SecCertificateCopySubjectSummary; issuer/validity are left empty in MVP —
    // the fingerprint is the security-critical field the user verifies.)
    let summary = (SecCertificateCopySubjectSummary(cert) as String?) ?? ""
    self.untrusted = UntrustedInfo(
      sha256: digest,
      subject: summary,
      issuer: "",
      notBefore: "",
      notAfter: ""
    )
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}

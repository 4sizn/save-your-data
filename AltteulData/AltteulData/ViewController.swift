//
//  ViewController.swift
//  AltteulData
//
//  Created on 2026. 10. 12.
//

import SafariServices
import UIKit
import WebKit

let extensionBundleIdentifier = "com.lotus.altteuldata.Extension"

// Shared with the extension's native handler, which hands the limits to background.js.
let sharedDefaults = UserDefaults(suiteName: "group.com.lotus.altteuldata")!
let limitsKey = "limits"
let defaultLimits = #"{"image":{"value":100,"unit":"KB"},"video":{"value":0,"unit":"MB"},"audio":{"value":0,"unit":"MB"}}"#

// Onboarding: shows whether the Safari extension is on and opens its settings page.
// The page itself is Resources/Main.html; the bridge script lives here so it needs no extra bundle file.
class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    private static let bridge = """
        function show(enabled) {
            document.body.classList.toggle("on", enabled === true);
            document.body.classList.toggle("off", enabled === false);
        }
        document.querySelector("button.open-settings").addEventListener("click", () => {
            webkit.messageHandlers.controller.postMessage("open-settings");
        });
        function setLimits(limits) {
            for (const [kind, { value, unit }] of Object.entries(limits)) {
                document.getElementById(`limit-${kind}`).value = value;
                document.querySelector(`input[name="unit-${kind}"][value="${unit}"]`).checked = true;
            }
        }
        document.querySelector(".limits").addEventListener("change", () => {
            const limits = {};
            for (const row of document.querySelectorAll(".limit-row")) {
                const kind = row.dataset.kind;
                const input = row.querySelector("input[type=number]");
                const value = Math.max(0, Math.floor(Number(input.value) || 0));
                input.value = value;
                limits[kind] = { value, unit: row.querySelector("input[type=radio]:checked").value };
            }
            webkit.messageHandlers.controller.postMessage(JSON.stringify(limits));
        });
        """

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self
        self.webView.isOpaque = false
        self.webView.backgroundColor = .systemGroupedBackground

        let controller = self.webView.configuration.userContentController
        controller.add(self, name: "controller")
        controller.addUserScript(WKUserScript(source: Self.bridge, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)

        // The user comes back from Settings: refresh the state.
        NotificationCenter.default.addObserver(self, selector: #selector(refreshState), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshState()
        let limits = sharedDefaults.string(forKey: limitsKey) ?? defaultLimits
        webView.evaluateJavaScript("setLimits(\(limits))")
    }

    @objc private func refreshState() {
        guard #available(iOS 26.2, *) else { return show(nil) }
        SFSafariExtensionManager.getStateOfExtension(withIdentifier: extensionBundleIdentifier) { state, _ in
            DispatchQueue.main.async { self.show(state?.isEnabled) }
        }
    }

    private func show(_ enabled: Bool?) {
        let arg = enabled.map { $0 ? "true" : "false" } ?? "null"
        webView.evaluateJavaScript("show(\(arg))")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }
        guard body == "open-settings" else {
            // Limits JSON from the settings form; the page already sanitized the numbers.
            sharedDefaults.set(body, forKey: limitsKey)
            return
        }
        if #available(iOS 26.2, *) {
            SFSafariSettings.openExtensionsSettings(forIdentifiers: [extensionBundleIdentifier]) { error in
                if error != nil { self.openAppSettings() }
            }
        } else {
            openAppSettings()
        }
    }

    // Fallback for older iOS: the closest page we can deep-link to; the page text gives the full path.
    private func openAppSettings() {
        UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)
    }

}

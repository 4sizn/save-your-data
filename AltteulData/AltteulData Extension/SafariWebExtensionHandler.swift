//
//  SafariWebExtensionHandler.swift
//  AltteulData Extension
//
//  Created on 2026. 10. 12.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        // getLimits: the size limits the user set in the app (shared through the App Group).
        var reply: [String: Any] = [:]
        if (message as? [String: Any])?["type"] as? String == "getLimits" {
            reply["limits"] = UserDefaults(suiteName: "group.com.lotus.altteuldata")?.string(forKey: "limits") ?? NSNull()
        } else {
            os_log(.default, "Unknown native message: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")
        }

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [ SFExtensionMessageKey: reply ]
        } else {
            response.userInfo = [ "message": reply ]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}

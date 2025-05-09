/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AmazonQAppInitContext } from '../amazonq/apps/initContext'
import { MessagePublisher } from '../amazonq/messages/messagePublisher'
import { MessageListener } from '../amazonq/messages/messageListener'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import { ChatSessionManager } from './chat/storages/chatSession'
import { TestController, TestChatControllerEventEmitters } from './chat/controller/controller'
import { AppToWebViewMessageDispatcher } from './chat/views/connector/connector'
import { Messenger } from './chat/controller/messenger/messenger'
import { UIMessageListener } from './chat/views/actions/uiMessageListener'
import { debounce } from 'lodash'
import { testGenState } from '../codewhisperer/models/model'

export function init(appContext: AmazonQAppInitContext) {
    const testChatControllerEventEmitters: TestChatControllerEventEmitters = {
        tabOpened: new vscode.EventEmitter<any>(),
        tabClosed: new vscode.EventEmitter<any>(),
        authClicked: new vscode.EventEmitter<any>(),
        startTestGen: new vscode.EventEmitter<any>(),
        processHumanChatMessage: new vscode.EventEmitter<any>(),
        updateTargetFileInfo: new vscode.EventEmitter<any>(),
        showCodeGenerationResults: new vscode.EventEmitter<any>(),
        openDiff: new vscode.EventEmitter<any>(),
        formActionClicked: new vscode.EventEmitter<any>(),
        followUpClicked: new vscode.EventEmitter<any>(),
        sendUpdatePromptProgress: new vscode.EventEmitter<any>(),
        errorThrown: new vscode.EventEmitter<any>(),
        insertCodeAtCursorPosition: new vscode.EventEmitter<any>(),
        processResponseBodyLinkClick: new vscode.EventEmitter<any>(),
        processChatItemVotedMessage: new vscode.EventEmitter<any>(),
        processChatItemFeedbackMessage: new vscode.EventEmitter<any>(),
    }
    const dispatcher = new AppToWebViewMessageDispatcher(appContext.getAppsToWebViewMessagePublisher())
    const messenger = new Messenger(dispatcher)

    new TestController(testChatControllerEventEmitters, messenger, appContext.onDidChangeAmazonQVisibility.event)

    const testChatUIInputEventEmitter = new vscode.EventEmitter<any>()

    new UIMessageListener({
        chatControllerEventEmitters: testChatControllerEventEmitters,
        webViewMessageListener: new MessageListener<any>(testChatUIInputEventEmitter),
    })

    appContext.registerWebViewToAppMessagePublisher(new MessagePublisher<any>(testChatUIInputEventEmitter), 'testgen')

    const debouncedEvent = debounce(async () => {
        const authenticated = (await AuthUtil.instance.getChatAuthState()).amazonQ === 'connected'
        let authenticatingSessionID = ''

        if (authenticated) {
            const session = ChatSessionManager.Instance.getSession()

            if (session.isTabOpen() && session.isAuthenticating) {
                authenticatingSessionID = session.tabID!
                session.isAuthenticating = false
            }
        }

        messenger.sendAuthenticationUpdate(authenticated, [authenticatingSessionID])
    }, 500)

    AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(() => {
        return debouncedEvent()
    })
    AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(() => {
        return debouncedEvent()
    })
    testGenState.setChatControllers(testChatControllerEventEmitters)
    // TODO: Add testGen provider for creating new files after test generation if they does not exist
}

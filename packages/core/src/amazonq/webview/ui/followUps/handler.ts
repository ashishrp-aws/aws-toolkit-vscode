/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemAction, ChatItemType, MynahUI } from '@aws/mynah-ui'
import { Connector } from '../connector'
import { TabsStorage } from '../storages/tabsStorage'
import { WelcomeFollowupType } from '../apps/amazonqCommonsConnector'
import { AuthFollowUpType } from './generator'
import { MynahUIRef } from '../../../commons/types'

export interface FollowUpInteractionHandlerProps {
    mynahUIRef: MynahUIRef
    connector: Connector
    tabsStorage: TabsStorage
}

export class FollowUpInteractionHandler {
    private mynahUIRef: MynahUIRef
    private connector: Connector
    private tabsStorage: TabsStorage

    constructor(props: FollowUpInteractionHandlerProps) {
        this.mynahUIRef = props.mynahUIRef
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
    }

    public onFollowUpClicked(tabID: string, messageId: string, followUp: ChatItemAction) {
        if (
            followUp.type !== undefined &&
            ['full-auth', 're-auth', 'missing_scopes', 'use-supported-auth'].includes(followUp.type)
        ) {
            this.connector.onAuthFollowUpClicked(tabID, followUp.type as AuthFollowUpType)
            return
        }
        if (followUp.type !== undefined && followUp.type === 'help') {
            this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
            this.connector.onUpdateTabType(tabID)
            this.connector.help(tabID)
            return
        }

        if (!this.mynahUI) {
            return
        }

        // we need to check if there is a prompt
        // which will cause an api call
        // then we can set the loading state to true
        if (followUp.prompt !== undefined) {
            this.mynahUI.updateStore(tabID, {
                loadingChat: true,
                cancelButtonWhenLoading: false,
                promptInputDisabledState: true,
            })
            this.mynahUI.addChatItem(tabID, {
                type: ChatItemType.PROMPT,
                body: followUp.prompt,
            })
            this.mynahUI.addChatItem(tabID, {
                type: ChatItemType.ANSWER_STREAM,
                body: '',
            })
            this.tabsStorage.updateTabStatus(tabID, 'busy')
            this.tabsStorage.resetTabTimer(tabID)

            if (followUp.type !== undefined && followUp.type === 'init-prompt') {
                void this.connector.requestGenerativeAIAnswer(tabID, messageId, {
                    chatMessage: followUp.prompt,
                })
                return
            }
        }

        this.connector.onFollowUpClicked(tabID, messageId, followUp)
    }

    public onWelcomeFollowUpClicked(tabID: string, welcomeFollowUpType: WelcomeFollowupType) {
        if (welcomeFollowUpType === 'continue-to-chat') {
            this.mynahUI?.addChatItem(tabID, {
                type: ChatItemType.ANSWER,
                body: 'Ok, please write your question below.',
            })
            this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
            this.connector.onUpdateTabType(tabID)
            return
        }
    }

    private get mynahUI(): MynahUI | undefined {
        return this.mynahUIRef.mynahUI
    }
}
